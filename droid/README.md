# frenpitch droid — flash guide (platformio, same route as sauron-eye)

the firmware lives in `firmware/` and is built exactly like the jarvis/sauron-eye
project: platformio + pioarduino espressif32, feetech scs servos on uart1,
and the same battle-tested cores3 power bring-up (PY32 blind writes, AW9523
0x83 blind write, BLDO2 rail).

## 1. configure

edit the top of `firmware/src/main.cpp`:

```cpp
#define WIFI_SSID  "your wifi name"
#define WIFI_PASS  "your wifi password"
#define TG_USER_ID "1052859174"     // your telegram id
```

## 2. flash

plug the droid in via usb-c, then:

```bash
cd ~/frenpitch/droid/firmware
pio run -t upload
```

(same as sauron-eye — if `pio` isn't on PATH it's at `~/.platformio/penv/bin/pio`)

## 3. use

- boots → wifi (country CA, ch 1-13) → joins the live feed → hello nod
- which match it follows = app → me tab → droid card → **following**
  (auto = your latest pick). retargets within ~60s, no reflash
- events: goal strobe + dance, yellow/red card sequences, line-move flashes,
  var / kickoff / halftime / fulltime — plus idle rotation of face →
  live 1x2 line → win-prob bar

## demo mode (filming, no wifi)

hold the screen while it boots → scripted match loop:
goal → line move → yellow → red → full time, on repeat.

## monitor

```bash
pio device monitor
```

servo bring-up logs the power/bus/ping status — same self-heal
(6 retries, 15s apart) as sauron-eye.

## switch back

- to sauron-eye: flash that repo's firmware the same way
- to stock: `python3 -m esptool write_flash 0x0 stackchan-backup.bin`
