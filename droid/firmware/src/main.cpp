// ===================================================================
//  stack-chan :: FRENPITCH DROID — matchday pundit 👁️⃤
//  LED dot-matrix face + live match events over SSE + feetech motion.
//
//  built on the sauron-eye (jarvis) foundation — same board, same
//  servo bus, same hard-won power bring-up. lessons carried over:
//    - never read-modify-write AW9523 reg 0x03 (blind-write 0x83)
//    - only ONE core touches M5.Display (render loop owns it)
//    - PY32 @0x6F lies on reads: presence = address ACK, blind writes
//    - wifi country CA or bell/canadian routers on ch 12/13 vanish
//
//  servos (stock stackchan base): UART1 @1Mbaud, TX=6 RX=7
//    yaw = id 1, center 460  |  pitch = id 2, center 620  (0..1000)
//
//  events (from https://frenpitch.vercel.app/api/feed?user=...):
//    goal → green strobe GOAL → celebration face + dance → score ticker
//    card_yellow → card frame → amber squint → "CAUTION · 70'"
//    card_red → red strobe → shocked face + headshake → "SENT OFF"
//    odds_move → amber line-move flash "2.10 → 1.85 v"
//    kickoff / halftime / var_check / fulltime
//  idle rotation: face → live 1x2 line → win-prob bar
//
//  demo mode (filming, no wifi): hold the screen during boot.
// ===================================================================
#include <M5Unified.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SCServo.h>
#include <Avatar.h>
#include <math.h>

using namespace m5avatar;

#include "secrets.h"   // WIFI_SSID / WIFI_PASS / TG_USER_ID — gitignored, copy secrets.example.h
#define FEED_HOST  "frenpitch.vercel.app"

// ---- servo power (PY32 io-expander @0x6F, pin0 = "VM EN") ----
static const uint8_t IOE_ADDR = 0x6F;
static bool ioeInit_on(decltype(M5.In_I2C)& bus, const char* name) {
  // PY32 bit-bangs i2c: ACKs its ADDRESS reliably, register READS return
  // 0x00/0xFF. presence = address ACK only; enable = BLIND writes @100kHz.
  if (!bus.scanID(IOE_ADDR)) return false;
  uint8_t ver = bus.readRegister8(IOE_ADDR, 0x02, 100000);
  Serial.printf("io-expander @0x6F on %s (ver 0x%02X — reads unreliable, ignored)\n", name, ver);
  bus.writeRegister8(IOE_ADDR, 0x03, 0x01, 100000);  // GPIO_M_L : pin0 output
  bus.writeRegister8(IOE_ADDR, 0x0B, 0x00, 100000);  // pull-downs off
  bus.writeRegister8(IOE_ADDR, 0x09, 0x01, 100000);  // pin0 pull-up on
  bus.writeRegister8(IOE_ADDR, 0x05, 0x01, 100000);  // pin0 HIGH → servo VM ON
  return true;
}
static void powerStackchanBase() {
  // AW9523 reg 0x03 holds BOTH BOOST_EN (bit7) AND LCD_RST (bit1) — never
  // read-modify-write it (a glitchy read killed a panel once). blind-write
  // M5GFX's known-good value 0x83. reg 0x02 (BUS_EN) is port0 — display-safe.
  M5.Power.setExtOutput(true);
  M5.In_I2C.bitOn(0x58, 0x02, 0x02, 400000);          // BUS_EN → 5V to the base
  M5.In_I2C.writeRegister8(0x58, 0x03, 0x83, 400000); // BOOST_EN | LCD_RST | P1_0
  M5.In_I2C.writeRegister8(0x34, 0x97, 0x1C, 400000); // AXP2101 BLDO2 = 3.3V (PY32 logic rail)
}
static bool enableServoPower() {
  powerStackchanBase();
  delay(500);                                          // let the 5V boost stabilize
  for (int i = 0; i < 40; i++) {                       // ~7s window
    if (ioeInit_on(M5.In_I2C, "In_I2C")) return true;
    if (ioeInit_on(M5.Ex_I2C, "Ex_I2C")) return true;
    if ((i & 7) == 7) powerStackchanBase();
    delay(150);
  }
  return false;
}

// ---- servos ----
static SCSCL sc;
#define YAW_ID 1
#define PIT_ID 2
static const int YAW_C = 460, PIT_C = 620;
static inline int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }
static inline void mv(int id, int pos, int t) { sc.WritePos(id, (u16)clampi(pos, 60, 940), t, 0); }
static volatile int gReq = 0;   // 1 perk · 2 nod · 3 shake · 5 dance
static bool haveServo = false;
static volatile int gServoAlive = -1;

static bool servoRecover(const char* why) {
  Serial.printf("servo recover (%s)...\n", why);
  bool pwr = enableServoPower();
  if (!haveServo) haveServo = sc.begin(UART_NUM_1, 1000000, 6, 7);
  bool alive = false;
  if (haveServo) {
    sc.EnableTorque(YAW_ID, 1); sc.EnableTorque(PIT_ID, 1);
    alive = (sc.Ping(YAW_ID) != -1);
    if (alive) { mv(YAW_ID, YAW_C, 400); mv(PIT_ID, PIT_C, 400); }
  }
  gServoAlive = alive ? 1 : 0;
  Serial.printf("servo recover: power=%s bus=%s ping=%s\n", pwr ? "on" : "MISS", haveServo ? "ok" : "FAIL", alive ? "alive" : "DEAD");
  return alive;
}

// gestures run INSIDE motionTask (blocking there is fine)
static void center(int t = 350) { mv(YAW_ID, YAW_C, t); mv(PIT_ID, PIT_C, t); vTaskDelay(t / portTICK_PERIOD_MS); }
static void gPerk()  { mv(YAW_ID, YAW_C, 180); mv(PIT_ID, PIT_C - 60, 180); vTaskDelay(220); center(250); }
static void gNod()   { for (int i = 0; i < 2; i++) { mv(PIT_ID, PIT_C + 38, 150); vTaskDelay(160); mv(PIT_ID, PIT_C, 150); vTaskDelay(160); } }
static void gShake() { for (int i = 0; i < 2; i++) { mv(YAW_ID, YAW_C - 120, 200); vTaskDelay(220); mv(YAW_ID, YAW_C + 120, 200); vTaskDelay(220); } center(250); }
static void gDance() {
  for (int i = 0; i < 3; i++) {
    mv(YAW_ID, YAW_C - 130, 200); mv(PIT_ID, PIT_C - 60, 200); vTaskDelay(230);
    mv(YAW_ID, YAW_C + 130, 200); mv(PIT_ID, PIT_C + 70, 200); vTaskDelay(230);
  }
  center(300);
}

static void motionTask(void*) {
  uint32_t nextSway = millis() + 4000;
  uint32_t nextAutoFix = millis() + 3000;
  static int autoTries = 0;
  for (;;) {
    if (gServoAlive != 1 && autoTries < 6 && !gReq && millis() > nextAutoFix) {
      autoTries++; servoRecover("auto"); nextAutoFix = millis() + 15000;
    }
    int g = gReq;
    if (g) {
      gReq = 0;
      if (haveServo) // fire-and-forget: writes need no RX
        switch (g) { case 1: gPerk(); break; case 2: gNod(); break; case 3: gShake(); break; case 5: gDance(); break; }
      nextSway = millis() + 4000;
    } else if (haveServo && millis() > nextSway) {
      // subtle breathing sway
      mv(YAW_ID, YAW_C + (int)(12 * sinf(millis() * 0.00025f)), 1200);
      nextSway = millis() + 6000;
    }
    vTaskDelay(30 / portTICK_PERIOD_MS);
  }
}

// ================= colors =================
#define C_BG     TFT_BLACK
static uint16_t C_GREEN, C_AMBER, C_RED, C_PURPLE, C_BLUE, C_DIM;

// ================= match state =================
enum Mood { M_IDLE, M_JOY, M_LOST, M_SHOCK, M_SQUINT, M_SLEEPY };
struct MatchState {
  char home[8] = "---";
  char away[8] = "---";
  int  scoreH = 0, scoreA = 0, minute = 0;
  float oddsH = 0, oddsD = 0, oddsA = 0;
  int  probH = 0, probA = 0;
  int  dirH = 0, dirA = 0;   // last odds move: 1 up, -1 down, 0 flat
  bool live = false;
} match;

static Mood mood = M_IDLE;
static uint32_t moodUntil = 0, idleFlip = 0;
static bool demoMode = false;
static int idleFrame = 0;   // 0 face · 1 odds line · 2 prob bar

// ================= face: stock m5stack-avatar =================
// the official stackchan face — smooth vector eyes, auto-blink,
// breathing. football moments are custom overlay frames: we suspend
// the avatar's draw task, own the screen, then hand it back.
static Avatar avatar;
static bool avatarUp = false;

static void applyMood() {
  if (!avatarUp) return;
  switch (mood) {
    case M_JOY:    avatar.setExpression(Expression::Happy);   break;
    case M_LOST:   avatar.setExpression(Expression::Sad);     break;
    case M_SHOCK:  avatar.setExpression(Expression::Angry);   break;
    case M_SQUINT: avatar.setExpression(Expression::Doubt);   break;
    case M_SLEEPY: avatar.setExpression(Expression::Sleepy);  break;
    default:       avatar.setExpression(Expression::Neutral);
  }
}

// take the screen for a custom frame / give it back
static void frameBegin() { if (avatarUp) avatar.suspend(); delay(30); }
static void frameEnd()   { if (avatarUp) { applyMood(); avatar.resume(); } }

static void centerText(const char* s, int y, uint16_t col, int size) {
  M5.Display.setTextSize(size);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextColor(col, C_BG);
  M5.Display.drawString(s, M5.Display.width() / 2, y);
}

// ================= frames =================

// flags: real shapes, not just bands — vertical / horizontal tricolors,
// st george cross, nordic cross, disc-on-field. colors kept 24-bit.
enum FlagStyle { FV, FH, FCROSS, FNORDIC, FCIRC };
struct FlagDef { const char* code; FlagStyle style; uint32_t a, b, c; };
static FlagDef FLAG_TABLE[40];
static int FLAG_N = 0;
static void addFlag(const char* code, FlagStyle st, uint32_t a, uint32_t b, uint32_t c) {
  FLAG_TABLE[FLAG_N++] = { code, st, a, b, c };
}
static inline uint16_t rgb565(uint32_t rgb, float dim = 1.0f) {
  return M5.Display.color565(
    (uint8_t)(((rgb >> 16) & 255) * dim),
    (uint8_t)(((rgb >> 8) & 255) * dim),
    (uint8_t)((rgb & 255) * dim));
}
static const FlagDef* findFlag(const char* code) {
  for (int i = 0; i < FLAG_N; i++)
    if (!strcmp(FLAG_TABLE[i].code, code)) return &FLAG_TABLE[i];
  return nullptr;
}
static void initFlags() {
  addFlag("NOR", FNORDIC, 0xEF2B2D, 0xFFFFFF, 0x002868);
  addFlag("ENG", FCROSS, 0xF5F5F5, 0xCE1124, 0);
  addFlag("FRA", FV, 0x0055A4, 0xFFFFFF, 0xEF4135);
  addFlag("ESP", FH, 0xAA151B, 0xF1BF00, 0xAA151B);
  addFlag("SPA", FH, 0xAA151B, 0xF1BF00, 0xAA151B);
  addFlag("BRA", FCIRC, 0x009C3B, 0xFFDF00, 0);
  addFlag("ARG", FH, 0x74ACDF, 0xFFFFFF, 0x74ACDF);
  addFlag("GER", FH, 0x000000, 0xDD0000, 0xFFCE00);
  addFlag("ITA", FV, 0x009246, 0xFFFFFF, 0xCE2B37);
  addFlag("POR", FV, 0x006600, 0xFF0000, 0xFF0000);
  addFlag("NED", FH, 0xAE1C28, 0xFFFFFF, 0x21468B);
  addFlag("BEL", FV, 0x000000, 0xFDDA24, 0xEF3340);
  addFlag("CRO", FH, 0xFF0000, 0xFFFFFF, 0x171796);
  addFlag("MAR", FCIRC, 0xC1272D, 0x006233, 0);
  addFlag("JAP", FCIRC, 0xF5F5F5, 0xBC002D, 0);
  addFlag("SOU", FCIRC, 0xF5F5F5, 0xCD2E3A, 0);
  addFlag("USA", FH, 0xB22234, 0xFFFFFF, 0x3C3B6E);
  addFlag("MEX", FV, 0x006847, 0xFFFFFF, 0xCE1126);
  addFlag("CAN", FV, 0xFF0000, 0xFFFFFF, 0xFF0000);
  addFlag("URU", FH, 0xFFFFFF, 0x74ACDF, 0xFFFFFF);
  addFlag("COL", FH, 0xFCD116, 0x003893, 0xCE1126);
  addFlag("SEN", FV, 0x00853F, 0xFDEF42, 0xE31B23);
  addFlag("GHA", FH, 0xCE1126, 0xFCD116, 0x006B3F);
  addFlag("AUS", FCIRC, 0x00247D, 0xF5F5F5, 0);
  addFlag("VIE", FCIRC, 0xDA251D, 0xFFFF00, 0);
  addFlag("MYA", FH, 0xFECB00, 0x34B233, 0xEA2839);
  addFlag("IND", FH, 0xFF9933, 0xFFFFFF, 0x138808);
  addFlag("NEW", FCIRC, 0x00247D, 0xCC142B, 0);
}

/** styled flag renderer — exact shapes at any size */
static void drawFlag(int x, int y, int w, int h, const char* code) {
  const FlagDef* f = findFlag(code);
  if (!f) {
    M5.Display.fillCircle(x + w / 2, y + h / 2, h / 2, C_DIM);
    return;
  }
  switch (f->style) {
    case FV: {
      int band = w / 3;
      M5.Display.fillRect(x, y, band, h, rgb565(f->a));
      M5.Display.fillRect(x + band, y, band, h, rgb565(f->b));
      M5.Display.fillRect(x + 2 * band, y, w - 2 * band, h, rgb565(f->c));
      break;
    }
    case FH: {
      int band = h / 3;
      M5.Display.fillRect(x, y, w, band, rgb565(f->a));
      M5.Display.fillRect(x, y + band, w, band, rgb565(f->b));
      M5.Display.fillRect(x, y + 2 * band, w, h - 2 * band, rgb565(f->c));
      break;
    }
    case FCROSS: { // st george: field + centered cross
      M5.Display.fillRect(x, y, w, h, rgb565(f->a));
      int t = h / 5;
      M5.Display.fillRect(x, y + (h - t) / 2, w, t, rgb565(f->b));
      M5.Display.fillRect(x + (w - t) / 2, y, t, h, rgb565(f->b));
      break;
    }
    case FNORDIC: { // field + offset white outer cross + colored inner
      M5.Display.fillRect(x, y, w, h, rgb565(f->a));
      int cxp = x + w * 2 / 5;
      int to = h / 3, ti = h / 6;
      M5.Display.fillRect(x, y + (h - to) / 2, w, to, rgb565(f->b));
      M5.Display.fillRect(cxp - to / 2, y, to, h, rgb565(f->b));
      M5.Display.fillRect(x, y + (h - ti) / 2, w, ti, rgb565(f->c));
      M5.Display.fillRect(cxp - ti / 2, y, ti, h, rgb565(f->c));
      break;
    }
    case FCIRC: { // field + centered disc
      M5.Display.fillRect(x, y, w, h, rgb565(f->a));
      M5.Display.fillCircle(x + w / 2, y + h / 2, h / 3, rgb565(f->b));
      break;
    }
  }
  M5.Display.drawRect(x, y, w, h, M5.Display.color565(60, 60, 70));
}

// fake-bold: draw twice with 1px offset
static void boldText(const char* s, int x, int y, uint16_t col, int size, uint8_t datum) {
  M5.Display.setTextSize(size);
  M5.Display.setTextDatum(datum);
  M5.Display.setTextColor(col, C_BG);
  M5.Display.drawString(s, x, y);
  M5.Display.drawString(s, x + 1, y);
}

static void drawScoreStrip() {
  const int H = 30, FW = 34, FH = 20, cy = 5;
  int W = M5.Display.width();
  M5.Display.fillRect(0, 0, W, H, C_BG);

  char score[10];
  snprintf(score, sizeof(score), "%d-%d", match.scoreH, match.scoreA);

  // center: big bold score
  boldText(score, W / 2, 2, match.live ? C_GREEN : C_DIM, 3, top_center);

  // left: flag + bold code · right: code + flag
  drawFlag(6, cy, FW, FH, match.home);
  boldText(match.home, 6 + FW + 8, 6, C_GREEN, 2, top_left);
  drawFlag(W - 6 - FW, cy, FW, FH, match.away);
  boldText(match.away, W - 6 - FW - 8, 6, C_PURPLE, 2, top_right);

  // minute under the score, amber
  if (match.live && match.minute > 0) {
    char m[8]; snprintf(m, sizeof(m), "%d'", match.minute);
    M5.Display.setTextSize(1);
    M5.Display.setTextDatum(top_center);
    M5.Display.setTextColor(C_AMBER, C_BG);
    M5.Display.drawString(m, W / 2, 26);
  }
}
/** the locked info frame — matched to the approved render:
 *  ● LIVE   64'   ⚽
 *  [fra flag]   [eng flag]
 *     FRA          ENG
 *      2     -      1        (home score in lime, away in white)
 *  ▪▪▪▪▪▪▪▪▪|▫▫▫▫▫▫          (segmented win-prob bar, center tick)
 *  ───────────────────
 *   2.06  ▲FRA │ 3.77 ▼ENG   (odds + move-direction arrows)      */
static void drawBallIcon(int cx, int cy, int r) {
  M5.Display.fillCircle(cx, cy, r, TFT_WHITE);
  M5.Display.drawCircle(cx, cy, r, TFT_BLACK);
  M5.Display.fillCircle(cx, cy, r / 3, TFT_BLACK);
  for (int i = 0; i < 5; i++) {
    float a = i * 1.2566f - 1.5708f;
    M5.Display.fillCircle(cx + (int)(cosf(a) * r * 0.66f), cy + (int)(sinf(a) * r * 0.66f), r / 5, TFT_BLACK);
  }
}

static void drawArrow(int x, int y, int dir, uint16_t up, uint16_t down) {
  if (dir > 0) M5.Display.fillTriangle(x, y + 8, x + 8, y + 8, x + 4, y, up);
  else if (dir < 0) M5.Display.fillTriangle(x, y, x + 8, y, x + 4, y + 8, down);
}

static void drawInfoPanel() {
  int W = M5.Display.width();
  int cxl = W / 4 + 4, cxr = 3 * W / 4 - 4;
  uint16_t lime = M5.Display.color565(154, 235, 62);
  uint16_t gray = M5.Display.color565(90, 90, 100);
  uint16_t dimline = M5.Display.color565(46, 46, 56);
  uint16_t red = M5.Display.color565(232, 90, 40);
  M5.Display.fillScreen(C_BG);
  char buf[16];

  // ── top status row
  M5.Display.setTextDatum(top_left);
  M5.Display.setTextSize(2);
  if (match.live) {
    M5.Display.fillCircle(18, 16, 5, lime);
    M5.Display.setTextColor(lime, C_BG);
    M5.Display.drawString("LIVE", 30, 9);
    snprintf(buf, sizeof(buf), "%d'", match.minute);
    M5.Display.setTextDatum(top_center);
    M5.Display.drawString(buf, W / 2 + 10, 9);
  } else {
    M5.Display.setTextColor(gray, C_BG);
    M5.Display.drawString("UPCOMING", 14, 9);
  }
  drawBallIcon(W - 22, 16, 11);

  // ── flags + codes
  drawFlag(cxl - 27, 34, 54, 34, match.home);
  drawFlag(cxr - 27, 34, 54, 34, match.away);
  M5.Display.setTextDatum(top_center);
  M5.Display.setTextSize(3);
  M5.Display.setTextColor(TFT_WHITE, C_BG);
  M5.Display.drawString(match.home, cxl, 76);
  M5.Display.drawString(match.away, cxr, 76);

  // ── score (home lime, away white, gray dash)
  M5.Display.setTextSize(7);
  if (match.live || match.scoreH + match.scoreA > 0) {
    snprintf(buf, sizeof(buf), "%d", match.scoreH);
    M5.Display.setTextColor(lime, C_BG);
    M5.Display.drawString(buf, cxl, 104);
    snprintf(buf, sizeof(buf), "%d", match.scoreA);
    M5.Display.setTextColor(TFT_WHITE, C_BG);
    M5.Display.drawString(buf, cxr, 104);
    M5.Display.setTextSize(4);
    M5.Display.setTextColor(gray, C_BG);
    M5.Display.drawString("-", W / 2, 116);
  } else {
    M5.Display.setTextSize(4);
    M5.Display.setTextColor(gray, C_BG);
    M5.Display.drawString("vs", W / 2, 116);
  }

  // ── segmented win-prob bar (lime | gray draw | white)
  if (match.probH + match.probA > 0) {
    const int SEG = 24, SW = 9, GAP = 3, y = 166, sh = 9;
    int x0 = (W - SEG * (SW + GAP) + GAP) / 2;
    int draw = 100 - match.probH - match.probA;
    int nH = (match.probH * SEG + 50) / 100;
    int nD = (draw * SEG + 50) / 100;
    for (int i = 0; i < SEG; i++) {
      uint16_t col = i < nH ? lime : i < nH + nD ? dimline : TFT_WHITE;
      M5.Display.fillRect(x0 + i * (SW + GAP), y, SW, sh, col);
    }
    M5.Display.drawFastVLine(W / 2, y - 3, sh + 6, lime); // center tick
  }

  // ── divider
  M5.Display.drawFastHLine(14, 188, W - 28, dimline);
  M5.Display.drawFastVLine(W / 2, 196, 38, dimline);

  // ── odds row + direction arrows
  if (match.oddsH > 0) {
    M5.Display.setTextSize(3);
    snprintf(buf, sizeof(buf), "%.2f", match.oddsH);
    M5.Display.setTextColor(lime, C_BG);
    M5.Display.drawString(buf, cxl, 198);
    snprintf(buf, sizeof(buf), "%.2f", match.oddsA);
    M5.Display.setTextColor(TFT_WHITE, C_BG);
    M5.Display.drawString(buf, cxr, 198);
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(gray, C_BG);
    drawArrow(cxl - 22, 226, match.dirH ? match.dirH : 1, lime, red);
    M5.Display.drawString(match.home, cxl + 12, 226);
    drawArrow(cxr - 22, 226, match.dirA ? match.dirA : -1, lime, red);
    M5.Display.drawString(match.away, cxr + 12, 226);
  }
}

// ================= voice (elevenlabs via our server) =================
// the droid fetches ready-made 16khz pcm from /api/droid/tts — the api
// key never leaves the server. playback = sauron-eye's announce path.
static String urlEncode(const char* s) {
  String out;
  for (const char* p = s; *p; p++) {
    char c = *p;
    if (isalnum((unsigned char)c)) out += c;
    else if (c == ' ') out += "%20";
    else { char b[5]; snprintf(b, sizeof(b), "%%%02X", (unsigned char)c); out += b; }
  }
  return out;
}

static void speak(const char* text) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient ha;
  WiFiClientSecure* cli = new WiFiClientSecure();
  cli->setInsecure();
  ha.begin(*cli, String("https://") + FEED_HOST + "/api/droid/tts?text=" + urlEncode(text));
  ha.setTimeout(8000);
  uint8_t* pcm = nullptr;
  if (ha.GET() == 200) {
    int len = ha.getSize();
    if (len > 64 && len < 400000 && (pcm = (uint8_t*)ps_malloc(len))) {
      WiFiClient* st = ha.getStreamPtr();
      size_t rd = 0;
      uint32_t t0 = millis();
      while (rd < (size_t)len && millis() - t0 < 10000) {
        int av = st->available();
        if (av > 0) { int n = st->read(pcm + rd, (size_t)av < (len - rd) ? av : (len - rd)); if (n > 0) rd += n; }
        else if (!st->connected() && st->available() == 0) break;
        else delay(3);
      }
      if (rd > 64) {
        int16_t* s = (int16_t*)pcm;
        size_t ns = rd / 2;
        for (size_t i = 0; i < ns; i++) s[i] = (int16_t)(s[i] * 0.9f); // slight duck, keep it loud
        M5.Speaker.playRaw((const int16_t*)pcm, ns, 16000, false);
        while (M5.Speaker.isPlaying()) delay(20);
      }
      free(pcm);
      pcm = nullptr;
    }
  }
  ha.end();
  delete cli;
}

// ================= sounds =================
static void beep(int f, int ms) { M5.Speaker.tone(f, ms); delay(ms); }
static void soundGoal()   { beep(880, 90); beep(1175, 90); beep(1568, 240); }
static void soundCard()   { beep(2400, 160); }
static void soundRed()    { beep(2400, 160); delay(60); beep(2400, 320); }
static void soundNotify() { beep(1568, 60); }

// ================= sequences (approved mocks, clean tickers) =================
static void strobe(uint16_t col, const char* word, int flashes) {
  for (int i = 0; i < flashes; i++) {
    M5.Display.fillScreen(col);
    M5.Display.setTextSize(5); M5.Display.setTextDatum(middle_center);
    M5.Display.setTextColor(C_BG);
    M5.Display.drawString(word, M5.Display.width() / 2, M5.Display.height() / 2);
    delay(160);
    M5.Display.fillScreen(C_BG);
    M5.Display.setTextColor(col);
    M5.Display.drawString(word, M5.Display.width() / 2, M5.Display.height() / 2);
    delay(160);
  }
}
static void ticker(const char* l1, const char* l2, uint16_t col) {
  M5.Display.fillScreen(C_BG);
  drawScoreStrip();
  centerText(l1, 108, col, 3);
  if (l2[0]) centerText(l2, 160, C_DIM, 2);
  delay(2200);
}
static void seqGoal() {
  frameBegin();
  soundGoal();
  strobe(C_GREEN, "GOAL", 3);
  gReq = 5;                        // dance (motionTask)
  char buf[36]; snprintf(buf, sizeof(buf), "%s %d-%d %s", match.home, match.scoreH, match.scoreA, match.away);
  char m[8]; snprintf(m, sizeof(m), "%d'", match.minute);
  ticker(buf, m, C_GREEN);
  mood = M_JOY; moodUntil = millis() + 8000;
  frameEnd();                      // avatar returns wearing Happy
  char say[64];
  snprintf(say, sizeof(say), "gooooal! %s %d, %s %d", match.home, match.scoreH, match.away, match.scoreA);
  speak(say);
}
static void seqYellow() {
  frameBegin();
  soundCard();
  M5.Display.fillScreen(C_BG);
  M5.Display.fillRoundRect(130, 60, 60, 90, 6, C_AMBER);   // card up
  delay(900);
  char m[8]; snprintf(m, sizeof(m), "%d'", match.minute);
  ticker("CAUTION", m, C_AMBER);
  mood = M_SQUINT; moodUntil = millis() + 6000;
  frameEnd();                      // avatar returns wearing Doubt
  speak("yellow card. careful now");
}
static void seqRed() {
  frameBegin();
  soundRed();
  strobe(C_RED, "RED", 2);
  gReq = 3;                        // headshake
  char m[8]; snprintf(m, sizeof(m), "%d'", match.minute);
  ticker("SENT OFF", m, C_RED);
  mood = M_SHOCK; moodUntil = millis() + 8000;
  frameEnd();                      // avatar returns wearing Angry
  speak("red card! he is off!");
}
static void seqOddsMove(float from, float to, const char* team) {
  frameBegin();
  soundNotify();
  char buf[36];
  snprintf(buf, sizeof(buf), "%s %.2f>%.2f %s", team, from, to, to < from ? "v" : "^");
  for (int i = 0; i < 2; i++) {
    M5.Display.fillScreen(C_BG);
    drawScoreStrip();
    centerText(buf, 112, C_AMBER, 2);
    centerText("LINE MOVE", 160, C_BLUE, 1);
    delay(450);
    M5.Display.fillScreen(C_BG);
    delay(140);
  }
  idleFrame = 1; idleFlip = millis();
  drawInfoPanel();                 // land on the split panel (still suspended)
}

// ================= sse feed =================
static WiFiClientSecure net;
static String sseBuf;

static bool feedConnect() {
  net.setInsecure();               // public odds data
  if (!net.connect(FEED_HOST, 443)) return false;
  net.printf("GET /api/feed?user=%s HTTP/1.1\r\nHost: %s\r\nAccept: text/event-stream\r\nConnection: keep-alive\r\n\r\n",
             TG_USER_ID, FEED_HOST);
  Serial.println("feed: connected");
  return true;
}

static void handleEvent(JsonDocument& doc) {
  const char* type = doc["type"] | "";
  match.minute = doc["minute"] | match.minute;
  if (doc["scoreHome"].is<int>()) match.scoreH = doc["scoreHome"];
  if (doc["scoreAway"].is<int>()) match.scoreA = doc["scoreAway"];
  if (doc["home"].is<const char*>()) strlcpy(match.home, doc["home"], sizeof(match.home));
  if (doc["away"].is<const char*>()) strlcpy(match.away, doc["away"], sizeof(match.away));

  if (!strcmp(type, "odds_move")) {
    float prevH = match.oddsH;
    float prevA = match.oddsA;
    match.oddsH = doc["odds"]["home"] | match.oddsH;
    match.oddsD = doc["odds"]["draw"] | match.oddsD;
    match.oddsA = doc["odds"]["away"] | match.oddsA;
    if (prevH > 0 && match.oddsH != prevH) match.dirH = match.oddsH > prevH ? 1 : -1;
    if (prevA > 0 && match.oddsA != prevA) match.dirA = match.oddsA > prevA ? 1 : -1;
    if (doc["probs"]["home"].is<int>()) { match.probH = doc["probs"]["home"]; match.probA = doc["probs"]["away"]; }
    if (match.live && prevH > 0 && fabsf(prevH - match.oddsH) >= 0.05f)
      seqOddsMove(prevH, match.oddsH, match.home);
  }
  else if (!strcmp(type, "goal") || !strcmp(type, "own_goal")) { match.live = true; seqGoal(); }
  else if (!strcmp(type, "card_yellow")) { match.live = true; seqYellow(); }
  else if (!strcmp(type, "card_red"))    { match.live = true; seqRed(); }
  else if (!strcmp(type, "corner")) {
    match.live = true;
    const char* t = !strcmp(doc["team"] | "home", "away") ? match.away : match.home;
    frameBegin();
    soundNotify();
    ticker("CORNER", t, C_BLUE);
    frameEnd();
    char say[48]; snprintf(say, sizeof(say), "corner for %s", t);
    speak(say);
  }
  else if (!strcmp(type, "shot")) {
    match.live = true;
    soundNotify();                          // quick chirp only — shots are
    mood = M_SQUINT; moodUntil = millis() + 2500;  // frequent, voice would spam
    applyMood();
  }
  else if (!strcmp(type, "var_check")) {
    frameBegin();
    soundNotify();
    ticker("VAR CHECK", "", C_AMBER);
    mood = M_SQUINT; moodUntil = millis() + 5000;
    frameEnd();
  }
  else if (!strcmp(type, "kickoff")) {
    if (!match.live) {              // txline tags all in-play noise status 2/4 —
      match.live = true;            // only celebrate the FIRST kickoff
      frameBegin();
      soundNotify();
      ticker("KICKOFF", "", C_GREEN);
      frameEnd();
      gReq = 1;
      speak("kickoff! we are live");
    }
  }
  else if (!strcmp(type, "halftime"))    { mood = M_SLEEPY; moodUntil = millis() + 15000; applyMood(); }
  else if (!strcmp(type, "fulltime")) {
    match.live = false;
    frameBegin();
    char buf[36]; snprintf(buf, sizeof(buf), "%s %d-%d %s", match.home, match.scoreH, match.scoreA, match.away);
    ticker("FULL TIME", buf, C_PURPLE);
    mood = M_IDLE;
    frameEnd();
    gReq = 2;                      // nod goodnight
    char say[64];
    snprintf(say, sizeof(say), "full time. %s %d, %s %d", match.home, match.scoreH, match.away, match.scoreA);
    speak(say);
  }
}

static void feedPoll() {
  if (!net.connected()) {
    static uint32_t lastTry = 0;
    if (millis() - lastTry > 5000) { lastTry = millis(); feedConnect(); }
    return;
  }
  while (net.available()) {
    char c = net.read();
    if (c == '\n') {
      if (sseBuf.startsWith("data: ")) {
        JsonDocument doc;
        if (deserializeJson(doc, sseBuf.substring(6)) == DeserializationError::Ok) handleEvent(doc);
      }
      sseBuf = "";
    } else if (c != '\r') {
      sseBuf += c;
      if (sseBuf.length() > 4096) sseBuf = "";
    }
  }
}

// ================= expression showcase (tap the screen) =================
// stock avatar expressions back to back, then the football frames
static void showcaseExpr(const char* name, Expression e) {
  avatar.setExpression(e);
  avatar.setSpeechText(name);
  delay(1800);
}

static void runShowcase() {
  if (!avatarUp) return;
  showcaseExpr("neutral", Expression::Neutral);
  showcaseExpr("happy - goal", Expression::Happy);
  showcaseExpr("sad - pick lost", Expression::Sad);
  showcaseExpr("angry - red card", Expression::Angry);
  showcaseExpr("doubt - var check", Expression::Doubt);
  showcaseExpr("sleepy - halftime", Expression::Sleepy);
  avatar.setSpeechText("");
  // football frames
  avatar.suspend(); delay(30);
  strobe(C_GREEN, "GOAL", 2);
  M5.Display.fillScreen(C_BG);
  M5.Display.fillRoundRect(130, 60, 60, 90, 6, C_AMBER); delay(900); // card up
  strobe(C_RED, "RED", 2);
  drawInfoPanel(); delay(2000);
  mood = M_IDLE;
  applyMood();
  avatar.resume();
  gReq = 2;                        // finish with a nod
}

// ================= demo mode (filming) =================
static void runDemoStep() {
  static int step = 0;
  static uint32_t next = 0;
  if (millis() < next) return;
  strlcpy(match.home, "NOR", sizeof(match.home));
  strlcpy(match.away, "ENG", sizeof(match.away));
  match.live = true;
  switch (step % 6) {
    case 0: match.minute = 12; match.oddsH = 2.10f; match.oddsD = 3.40f; match.oddsA = 3.10f;
            match.probH = 62; match.probA = 33; next = millis() + 6000; break;
    case 1: match.minute = 23; match.scoreH = 1; seqGoal(); next = millis() + 8000; break;
    case 2: match.minute = 41; match.oddsH = 1.85f; match.oddsA = 3.77f;
            match.dirH = -1; match.dirA = 1;
            seqOddsMove(2.10f, 1.85f, match.home); next = millis() + 7000; break;
    case 3: match.minute = 55; seqYellow(); next = millis() + 8000; break;
    case 4: match.minute = 70; seqRed(); next = millis() + 8000; break;
    case 5: match.minute = 90; match.scoreA = 1;
            frameBegin();
            ticker("FULL TIME", "NOR 1-1 ENG", C_PURPLE);
            frameEnd();
            next = millis() + 6000;
            match.scoreH = 0; match.scoreA = 0; break;
  }
  step++;
}

// ================= boot =================
static void banner(const char* l1, const char* l2, uint16_t col) {
  M5.Display.fillScreen(C_BG);
  M5.Display.setTextDatum(middle_center); M5.Display.setTextSize(2);
  M5.Display.setTextColor(col, C_BG);
  M5.Display.drawString(l1, M5.Display.width() / 2, M5.Display.height() / 2 - 16);
  M5.Display.setTextColor(C_DIM, C_BG);
  M5.Display.drawString(l2, M5.Display.width() / 2, M5.Display.height() / 2 + 16);
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Speaker.setVolume(230);

  C_GREEN  = M5.Display.color565(126, 224, 74);
  C_AMBER  = M5.Display.color565(255, 179, 71);
  C_RED    = M5.Display.color565(255, 82, 82);
  C_PURPLE = M5.Display.color565(139, 127, 245);
  C_BLUE   = M5.Display.color565(90, 169, 255);
  C_DIM    = M5.Display.color565(40, 44, 58);
  initFlags();

  // motion runs on its own task — the render loop NEVER blocks on servos,
  // and only the render loop touches M5.Display (sauron lesson #2)
  xTaskCreatePinnedToCore(motionTask, "motion", 4096, nullptr, 1, nullptr, 0);

  M5.update();
  if (M5.Touch.getCount() > 0 || M5.BtnA.isPressed()) demoMode = true;

  banner("frenpitch droid", demoMode ? "demo mode" : "connecting wifi...", demoMode ? C_AMBER : C_GREEN);
  WiFi.mode(WIFI_STA);
  // bell/canadian routers park on ch 12/13 — default US config never finds them
  wifi_country_t ca = { "CA", 1, 13, WIFI_COUNTRY_POLICY_MANUAL };
  esp_wifi_set_country(&ca);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  // demo mode still wants wifi for the voice — shorter patience, no fallback drama
  uint32_t patience = demoMode ? 12000 : 20000;
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < patience) delay(200);

  if (!demoMode) {
    if (WiFi.status() == WL_CONNECTED) {
      banner("frenpitch droid", "joining the feed...", C_GREEN);
      feedConnect();
      gReq = 2;                    // hello nod
    } else {
      banner("no wifi", "falling back to demo", C_RED);
      demoMode = true;
    }
    delay(900);
  }

  // the stock stackchan face takes over from here — auto-blink,
  // breathing, expression per mood, score/odds in the speech balloon
  avatar.init();
  avatarUp = true;
  applyMood();

  // boot hook — the droid introduces itself (wifi needed for the voice)
  if (WiFi.status() == WL_CONNECTED) {
    speak("betting alone is a spreadsheet. betting in a stadium full of your frens is a sport.");
  }
}

void loop() {
  M5.update();

  // tap the screen (or BtnA) → expression showcase, back to back
  if (M5.Touch.getCount() > 0 || M5.BtnA.wasPressed()) {
    static uint32_t lastShow = 0;
    if (millis() - lastShow > 3000) {   // debounce a full tap-session
      lastShow = millis();
      runShowcase();
      idleFlip = millis(); idleFrame = 0;
    }
  }

  if (demoMode) runDemoStep();
  else feedPoll();

  uint32_t now = millis();

  // temp mood expiry → back to Neutral (avatar handles blink + breathing)
  if (mood != M_IDLE && moodUntil > 0 && now > moodUntil) {
    mood = M_IDLE; moodUntil = 0; applyMood();
  }

  // idle rotation: clean avatar face 12s → split info panel 5s
  if (now - idleFlip > (idleFrame == 0 ? 12000UL : 5000UL)) {
    int prev = idleFrame;
    idleFrame = (idleFrame + 1) % 2;
    if (idleFrame == 1 && match.oddsH <= 0 && !match.live) idleFrame = 0;
    idleFlip = now;
    if (idleFrame == 1) {
      if (prev == 0 && avatarUp) { avatar.suspend(); delay(30); }
      drawInfoPanel();
    } else if (prev == 1 && avatarUp) {
      applyMood();
      avatar.resume();
    }
  } else if (idleFrame == 1) {
    // keep the live minute fresh while the panel is up
    static uint32_t lastPanel = 0;
    if (match.live && now - lastPanel > 1000) { drawInfoPanel(); lastPanel = now; }
  }

  delay(20);
}
