/*
 * frenpitch droid — stackchan matchday pundit
 * board: m5stack cores3 (works on core2/fire too — M5Unified auto-detects)
 *
 * what it does:
 *   - LED dot-matrix face with 6 moods (approved design, style C)
 *   - live match events over SSE from the frenpitch server:
 *       goal → green strobe "GOAL" → celebration face + servo dance → score
 *       yellow card → card frame → squint → "CAUTION · 70'"
 *       red card → red strobe → shocked → "SENT OFF · 78'"
 *       odds move → amber ticker flash "2.10 → 1.85 ▼"
 *       halftime / fulltime / var / kickoff
 *   - idle rotation: face → live 1x2 line → win-prob bar
 *   - which match it follows is set in the app (me tab → droid → following);
 *     the server filters the feed — this firmware just renders what arrives
 *
 * demo mode (no wifi needed, for filming):
 *   hold the screen (or BtnA) during boot → scripted match loop
 *
 * arduino ide setup:
 *   1. boards manager → install "esp32 by Espressif"
 *   2. library manager → install: M5Unified, ArduinoJson, ESP32Servo
 *   3. tools → board → M5CoreS3   (or M5Core2 / M5Fire)
 *   4. fill in WIFI_SSID / WIFI_PASS / TG_USER_ID below
 *   5. upload
 */

#include <M5Unified.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

/* ================= config ================= */

const char* WIFI_SSID  = "YOUR_WIFI_NAME";
const char* WIFI_PASS  = "YOUR_WIFI_PASSWORD";
const char* TG_USER_ID = "1052859174";           // your telegram id → server filters feed to your followed match

const char* FEED_HOST  = "frenpitch.vercel.app";
const int   FEED_PORT  = 443;

#define HAS_SERVO 1        // 0 = static body
const int SERVO_PIN_X = 8; // cores3 port B white  (core2 port C: 13)
const int SERVO_PIN_Y = 9; // cores3 port B yellow (core2 port C: 14)

/* ================= colors (LED palette) ================= */

#define C_BG     0x0000                       // black
#define C_GREEN  M5.Display.color565(126, 224, 74)
#define C_AMBER  M5.Display.color565(255, 179, 71)
#define C_RED    M5.Display.color565(255, 82, 82)
#define C_PURPLE M5.Display.color565(139, 127, 245)
#define C_BLUE   M5.Display.color565(90, 169, 255)
#define C_DIM    M5.Display.color565(40, 44, 58)

/* ================= state ================= */

enum Mood { IDLE, GOAL_JOY, LOST, SHOCK, SQUINT, SLEEPY };

struct MatchState {
  char home[8]  = "---";
  char away[8]  = "---";
  int  scoreH = 0, scoreW = 0;
  int  minute = 0;
  float oddsH = 0, oddsD = 0, oddsA = 0;
  int  probH = 0, probA = 0;
  bool live = false;
} match;

Mood  mood        = IDLE;
unsigned long moodUntil = 0;       // when temp mood expires back to idle
unsigned long lastBlink = 0;
bool  blinking    = false;
int   idleFrame   = 0;             // 0 face · 1 odds line · 2 prob bar
unsigned long idleFlip = 0;
bool  demoMode    = false;

Servo servoX, servoY;

/* ================= LED dot-matrix renderer =================
 * everything is drawn as round dots on a grid so it reads as a
 * physical LED panel. 8px cells, r=3 dots. */

const int CELL = 8, DOT = 3;

void dot(int cx, int cy, uint16_t col) {
  M5.Display.fillCircle(cx * CELL + CELL / 2, cy * CELL + CELL / 2, DOT, col);
}

/* filled circle of dots (eye pupil / blob) */
void dotBlob(int cx, int cy, int r, uint16_t col) {
  for (int y = -r; y <= r; y++)
    for (int x = -r; x <= r; x++)
      if (x * x + y * y <= r * r) dot(cx + x, cy + y, col);
}

/* ring of dots (idle donut eye) */
void dotRing(int cx, int cy, int r, uint16_t col) {
  for (int y = -r; y <= r; y++)
    for (int x = -r; x <= r; x++) {
      int d2 = x * x + y * y;
      if (d2 <= r * r && d2 >= (r - 1) * (r - 1)) dot(cx + x, cy + y, col);
    }
}

void dotHLine(int cx0, int cx1, int cy, uint16_t col) {
  for (int x = cx0; x <= cx1; x++) dot(x, cy, col);
}

/* dotted text: renders glyphs with the built-in font, then samples it
 * onto the dot grid so tickers match the LED look */
void dotText(const char* s, int gridY, uint16_t col, int size) {
  M5.Display.setTextSize(size);
  M5.Display.setTextDatum(middle_center);
  int w = M5.Display.textWidth(s);
  int x = (M5.Display.width() - w) / 2;
  int y = gridY * CELL;
  M5.Display.setTextColor(col, C_BG);
  M5.Display.drawString(s, M5.Display.width() / 2, y);
}

/* ================= faces (grid is ~40x30 on 320x240) ================= */

const int EYE_LX = 13, EYE_RX = 26, EYE_Y = 11, MOUTH_Y = 21;

void faceIdle(bool blink) {
  if (blink) {
    dotHLine(EYE_LX - 3, EYE_LX + 3, EYE_Y, C_GREEN);
    dotHLine(EYE_RX - 3, EYE_RX + 3, EYE_Y, C_GREEN);
  } else {
    dotRing(EYE_LX, EYE_Y, 3, C_GREEN);
    dotRing(EYE_RX, EYE_Y, 3, C_GREEN);
  }
  dotHLine(17, 22, MOUTH_Y, C_GREEN);
}

void faceGoal() { // caret eyes + big smile
  for (int i = 0; i <= 3; i++) {
    dot(EYE_LX - i, EYE_Y - 2 + i, C_GREEN); dot(EYE_LX + i, EYE_Y - 2 + i, C_GREEN);
    dot(EYE_RX - i, EYE_Y - 2 + i, C_GREEN); dot(EYE_RX + i, EYE_Y - 2 + i, C_GREEN);
  }
  dotHLine(15, 24, MOUTH_Y, C_GREEN);
  dot(14, MOUTH_Y - 1, C_GREEN); dot(25, MOUTH_Y - 1, C_GREEN);
  dot(13, MOUTH_Y - 2, C_GREEN); dot(26, MOUTH_Y - 2, C_GREEN);
}

void faceLost() { // droop eyes + frown
  dotHLine(EYE_LX - 3, EYE_LX + 3, EYE_Y, C_PURPLE);
  dot(EYE_LX - 3, EYE_Y + 1, C_PURPLE); dot(EYE_LX + 3, EYE_Y + 1, C_PURPLE);
  dotHLine(EYE_RX - 3, EYE_RX + 3, EYE_Y, C_PURPLE);
  dot(EYE_RX - 3, EYE_Y + 1, C_PURPLE); dot(EYE_RX + 3, EYE_Y + 1, C_PURPLE);
  dotHLine(16, 23, MOUTH_Y + 1, C_PURPLE);
  dot(15, MOUTH_Y + 2, C_PURPLE); dot(24, MOUTH_Y + 2, C_PURPLE);
}

void faceShock() { // wide O eyes + o mouth (red-card energy)
  dotRing(EYE_LX, EYE_Y, 4, C_RED);
  dotRing(EYE_RX, EYE_Y, 4, C_RED);
  dotRing(19, MOUTH_Y, 2, C_RED);
}

void faceSquint() { // narrow amber slits (yellow card / var)
  dotHLine(EYE_LX - 3, EYE_LX + 3, EYE_Y, C_AMBER);
  dotHLine(EYE_RX - 3, EYE_RX + 3, EYE_Y, C_AMBER);
  dotHLine(17, 22, MOUTH_Y, C_AMBER);
}

void faceSleepy() { // half-closed + zzz (halftime)
  dotHLine(EYE_LX - 3, EYE_LX + 3, EYE_Y, C_BLUE);
  dotHLine(EYE_LX - 2, EYE_LX + 2, EYE_Y - 1, C_DIM);
  dotHLine(EYE_RX - 3, EYE_RX + 3, EYE_Y, C_BLUE);
  dotHLine(EYE_RX - 2, EYE_RX + 2, EYE_Y - 1, C_DIM);
  dotHLine(17, 22, MOUTH_Y, C_BLUE);
  dotText("z z z", 4, C_BLUE, 2);
}

/* ================= frames ================= */

void drawScoreStrip() {
  char buf[32];
  snprintf(buf, sizeof(buf), "%s %d-%d %s", match.home, match.scoreH, match.scoreW, match.away);
  M5.Display.fillRect(0, 0, M5.Display.width(), 20, C_BG);
  M5.Display.setTextSize(2);
  M5.Display.setTextDatum(top_center);
  M5.Display.setTextColor(match.live ? C_GREEN : C_DIM, C_BG);
  M5.Display.drawString(buf, M5.Display.width() / 2, 2);
  if (match.live && match.minute > 0) {
    char m[8];
    snprintf(m, sizeof(m), "%d'", match.minute);
    M5.Display.setTextDatum(top_right);
    M5.Display.setTextColor(C_AMBER, C_BG);
    M5.Display.drawString(m, M5.Display.width() - 6, 2);
  }
}

void drawFace() {
  M5.Display.fillScreen(C_BG);
  drawScoreStrip();
  switch (mood) {
    case GOAL_JOY: faceGoal();   break;
    case LOST:     faceLost();   break;
    case SHOCK:    faceShock();  break;
    case SQUINT:   faceSquint(); break;
    case SLEEPY:   faceSleepy(); break;
    default:       faceIdle(blinking);
  }
}

void drawOddsLine() {
  M5.Display.fillScreen(C_BG);
  drawScoreStrip();
  if (match.oddsH <= 0) { dotText("waiting for line", 15, C_DIM, 2); return; }
  char buf[48];
  snprintf(buf, sizeof(buf), "%s %.2f", match.home, match.oddsH);
  dotText(buf, 9, C_GREEN, 2);
  snprintf(buf, sizeof(buf), "X %.2f", match.oddsD);
  dotText(buf, 14, C_DIM, 2);
  snprintf(buf, sizeof(buf), "%s %.2f", match.away, match.oddsA);
  dotText(buf, 19, C_PURPLE, 2);
  dotText("LIVE LINE", 26, C_DIM, 1);
}

void drawProbBar() {
  M5.Display.fillScreen(C_BG);
  drawScoreStrip();
  if (match.probH + match.probA == 0) { dotText("no probs yet", 15, C_DIM, 2); return; }
  char buf[24];
  snprintf(buf, sizeof(buf), "%d%%", match.probH);
  M5.Display.setTextSize(3);
  M5.Display.setTextDatum(middle_left);
  M5.Display.setTextColor(C_GREEN, C_BG);
  M5.Display.drawString(buf, 12, 120);
  snprintf(buf, sizeof(buf), "%d%%", match.probA);
  M5.Display.setTextDatum(middle_right);
  M5.Display.setTextColor(C_PURPLE, C_BG);
  M5.Display.drawString(buf, M5.Display.width() - 12, 120);
  // dotted bar
  int total = 26, on = (match.probH * total) / 100;
  for (int i = 0; i < total; i++) dot(7 + i, 21, i < on ? C_GREEN : C_PURPLE);
  dotText("WIN PROBABILITY", 26, C_DIM, 1);
}

/* ================= sounds + servo ================= */

void beep(int freq, int ms) { M5.Speaker.tone(freq, ms); delay(ms); }

void soundGoal()   { beep(880, 90); beep(1175, 90); beep(1568, 240); }
void soundCard()   { beep(2400, 160); }                 // whistle-ish
void soundRed()    { beep(2400, 160); delay(60); beep(2400, 320); }
void soundLost()   { beep(392, 160); beep(311, 300); }
void soundNotify() { beep(1568, 60); }

void servoCenter() {
#if HAS_SERVO
  servoX.write(90); servoY.write(80);
#endif
}

void servoDance() {
#if HAS_SERVO
  for (int i = 0; i < 3; i++) {
    servoX.write(60);  servoY.write(60); delay(180);
    servoX.write(120); servoY.write(90); delay(180);
  }
  servoCenter();
#endif
}

void servoNodSad() {
#if HAS_SERVO
  servoY.write(100); delay(350); servoY.write(85); delay(250); servoY.write(100);
  delay(400); servoCenter();
#endif
}

/* ================= event sequences (approved mocks) ================= */

void strobe(uint16_t col, const char* word, int flashes) {
  for (int i = 0; i < flashes; i++) {
    M5.Display.fillScreen(col);
    M5.Display.setTextSize(5);
    M5.Display.setTextDatum(middle_center);
    M5.Display.setTextColor(C_BG);
    M5.Display.drawString(word, M5.Display.width() / 2, M5.Display.height() / 2);
    delay(160);
    M5.Display.fillScreen(C_BG);
    M5.Display.setTextColor(col);
    M5.Display.drawString(word, M5.Display.width() / 2, M5.Display.height() / 2);
    delay(160);
  }
}

void ticker(const char* line1, const char* line2, uint16_t col) {
  M5.Display.fillScreen(C_BG);
  drawScoreStrip();
  dotText(line1, 13, col, 3);
  if (line2[0]) dotText(line2, 20, C_DIM, 2);
  delay(2200);
}

void seqGoal(bool ours) {
  soundGoal();
  strobe(C_GREEN, "GOAL", 3);                       // frame 1: full strobe
  mood = ours ? GOAL_JOY : LOST; drawFace();        // frame 2: face
  if (ours) servoDance(); else servoNodSad();
  delay(600);
  char buf[24];                                      // frame 3: score ticker
  snprintf(buf, sizeof(buf), "%s %d-%d %s", match.home, match.scoreH, match.scoreW, match.away);
  char m[12]; snprintf(m, sizeof(m), "%d'", match.minute);
  ticker(buf, m, C_GREEN);
  moodUntil = millis() + 6000;
}

void seqYellow() {
  soundCard();
  // card-up frame
  M5.Display.fillScreen(C_BG);
  M5.Display.fillRoundRect(130, 60, 60, 90, 6, C_AMBER);
  delay(900);
  mood = SQUINT; drawFace(); delay(900);
  char m[16]; snprintf(m, sizeof(m), "%d'", match.minute);
  ticker("CAUTION", m, C_AMBER);
  moodUntil = millis() + 5000;
}

void seqRed() {
  soundRed();
  strobe(C_RED, "RED", 2);
  mood = SHOCK; drawFace(); servoNodSad(); delay(900);
  char m[16]; snprintf(m, sizeof(m), "%d'", match.minute);
  ticker("SENT OFF", m, C_RED);
  moodUntil = millis() + 6000;
}

void seqOddsMove(float from, float to, const char* team) {
  soundNotify();
  char buf[32];
  snprintf(buf, sizeof(buf), "%s %.2f>%.2f%s", team, from, to, to < from ? " v" : " ^");
  for (int i = 0; i < 2; i++) {                     // flash 2x per the mock
    M5.Display.fillScreen(C_BG);
    drawScoreStrip();
    dotText(buf, 15, C_AMBER, 2);
    dotText("LINE MOVE", 22, C_BLUE, 1);
    delay(450);
    M5.Display.fillScreen(C_BG);
    delay(140);
  }
  idleFrame = 1; idleFlip = millis();               // land on the live line
}

/* ================= sse feed ================= */

WiFiClientSecure net;
String sseBuf;

bool feedConnect() {
  net.setInsecure(); // public odds data; cert pinning not worth the flash
  if (!net.connect(FEED_HOST, FEED_PORT)) return false;
  net.printf("GET /api/feed?user=%s HTTP/1.1\r\nHost: %s\r\nAccept: text/event-stream\r\nConnection: keep-alive\r\n\r\n",
             TG_USER_ID, FEED_HOST);
  return true;
}

void handleEvent(JsonDocument& doc) {
  const char* type = doc["type"] | "";
  match.minute = doc["minute"] | match.minute;
  if (doc["scoreHome"].is<int>()) match.scoreH = doc["scoreHome"];
  if (doc["scoreAway"].is<int>()) match.scoreW = doc["scoreAway"];
  if (doc["home"].is<const char*>()) strlcpy(match.home, doc["home"], sizeof(match.home));
  if (doc["away"].is<const char*>()) strlcpy(match.away, doc["away"], sizeof(match.away));

  if (strcmp(type, "odds_move") == 0) {
    float prevH = match.oddsH;
    match.oddsH = doc["odds"]["home"] | match.oddsH;
    match.oddsD = doc["odds"]["draw"] | match.oddsD;
    match.oddsA = doc["odds"]["away"] | match.oddsA;
    if (doc["probs"]["home"].is<int>()) { match.probH = doc["probs"]["home"]; match.probA = doc["probs"]["away"]; }
    if (match.live && prevH > 0 && fabs(prevH - match.oddsH) >= 0.05)
      seqOddsMove(prevH, match.oddsH, match.home);
  } else if (strcmp(type, "goal") == 0 || strcmp(type, "own_goal") == 0) {
    match.live = true;
    seqGoal(true); // the app knows your pick; droid celebrates every goal on your match
  } else if (strcmp(type, "card_yellow") == 0) { match.live = true; seqYellow(); }
  else if (strcmp(type, "card_red") == 0)      { match.live = true; seqRed(); }
  else if (strcmp(type, "var_check") == 0)     { soundNotify(); mood = SQUINT; moodUntil = millis() + 4000; ticker("VAR CHECK", "", C_AMBER); }
  else if (strcmp(type, "kickoff") == 0)       { match.live = true; soundNotify(); ticker("KICKOFF", "", C_GREEN); }
  else if (strcmp(type, "halftime") == 0)      { mood = SLEEPY; moodUntil = millis() + 15000; }
  else if (strcmp(type, "fulltime") == 0) {
    match.live = false;
    char buf[24]; snprintf(buf, sizeof(buf), "%s %d-%d %s", match.home, match.scoreH, match.scoreW, match.away);
    ticker("FULL TIME", buf, C_PURPLE);
    mood = IDLE;
  }
}

void feedPoll() {
  if (!net.connected()) {
    static unsigned long lastTry = 0;
    if (millis() - lastTry > 5000) { lastTry = millis(); feedConnect(); }
    return;
  }
  while (net.available()) {
    char c = net.read();
    if (c == '\n') {
      if (sseBuf.startsWith("data: ")) {
        JsonDocument doc;
        if (deserializeJson(doc, sseBuf.substring(6)) == DeserializationError::Ok)
          handleEvent(doc);
      }
      sseBuf = "";
    } else if (c != '\r') {
      sseBuf += c;
      if (sseBuf.length() > 2048) sseBuf = ""; // safety
    }
  }
}

/* ================= demo mode (for filming) ================= */

void runDemoStep() {
  static int step = 0;
  static unsigned long next = 0;
  if (millis() < next) return;
  strlcpy(match.home, "NOR", sizeof(match.home));
  strlcpy(match.away, "ENG", sizeof(match.away));
  match.live = true;
  switch (step % 6) {
    case 0: match.minute = 12; match.oddsH = 2.10; match.oddsD = 3.40; match.oddsA = 3.10;
            match.probH = 62; match.probA = 38; next = millis() + 6000; break;
    case 1: match.minute = 23; match.scoreH = 1; seqGoal(true); next = millis() + 8000; break;
    case 2: match.minute = 41; seqOddsMove(2.10, 1.85, match.home); next = millis() + 7000; break;
    case 3: match.minute = 55; seqYellow(); next = millis() + 8000; break;
    case 4: match.minute = 70; seqRed(); next = millis() + 8000; break;
    case 5: match.minute = 90; match.scoreW = 1;
            ticker("FULL TIME", "NOR 1-1 ENG", C_PURPLE); next = millis() + 6000;
            match.scoreH = 0; match.scoreW = 0; break;
  }
  step++;
}

/* ================= arduino ================= */

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Display.fillScreen(C_BG);
  M5.Speaker.setVolume(120);

#if HAS_SERVO
  servoX.setPeriodHertz(50); servoY.setPeriodHertz(50);
  servoX.attach(SERVO_PIN_X, 500, 2400);
  servoY.attach(SERVO_PIN_Y, 500, 2400);
  servoCenter();
#endif

  // hold screen / BtnA at boot → demo mode
  M5.update();
  if (M5.Touch.getCount() > 0 || M5.BtnA.isPressed()) demoMode = true;

  M5.Display.setTextSize(2);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextColor(C_GREEN, C_BG);
  M5.Display.drawString("frenpitch droid", M5.Display.width() / 2, 100);

  if (demoMode) {
    M5.Display.setTextColor(C_AMBER, C_BG);
    M5.Display.drawString("demo mode", M5.Display.width() / 2, 130);
    delay(1200);
    return;
  }

  M5.Display.setTextColor(C_DIM, C_BG);
  M5.Display.drawString("connecting wifi...", M5.Display.width() / 2, 130);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) delay(200);
  if (WiFi.status() == WL_CONNECTED) {
    M5.Display.drawString("connected. joining feed", M5.Display.width() / 2, 160);
    feedConnect();
  } else {
    M5.Display.setTextColor(C_RED, C_BG);
    M5.Display.drawString("no wifi - demo mode", M5.Display.width() / 2, 160);
    demoMode = true;
  }
  delay(900);
}

void loop() {
  M5.update();

  if (demoMode) runDemoStep();
  else feedPoll();

  unsigned long now = millis();

  // temp mood expiry
  if (mood != IDLE && moodUntil > 0 && now > moodUntil) { mood = IDLE; moodUntil = 0; }

  // blink every ~4s
  if (mood == IDLE && now - lastBlink > 4000) {
    blinking = true; drawFace(); delay(120);
    blinking = false; lastBlink = now;
  }

  // idle rotation: face 8s → live line 4s → prob bar 4s
  if (now - idleFlip > (idleFrame == 0 ? 8000UL : 4000UL)) {
    idleFrame = (idleFrame + 1) % 3;
    if (!match.live && idleFrame > 0 && match.oddsH <= 0) idleFrame = 0; // nothing to show yet
    idleFlip = now;
    switch (idleFrame) {
      case 1: drawOddsLine(); break;
      case 2: drawProbBar();  break;
      default: drawFace();
    }
  } else if (idleFrame == 0) {
    static unsigned long lastDraw = 0;
    if (now - lastDraw > 1000) { drawFace(); lastDraw = now; } // keep minute fresh
  }

#if HAS_SERVO
  // gentle idle sway every ~12s
  static unsigned long lastSway = 0;
  if (mood == IDLE && now - lastSway > 12000) {
    servoX.write(80); delay(250); servoX.write(100); delay(250); servoCenter();
    lastSway = now;
  }
#endif

  delay(20);
}
