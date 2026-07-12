# frenpitch droid — flash guide (arduino ide, cores3)

## 1. one-time setup

1. install [arduino ide](https://www.arduino.cc/en/software)
2. settings → additional boards manager urls, add:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. tools → board → boards manager → search **esp32** → install "esp32 by Espressif Systems"
4. sketch → include library → manage libraries → install:
   - **M5Unified**
   - **ArduinoJson**
   - **ESP32Servo**

## 2. configure

open `frenpitch_droid/frenpitch_droid.ino` and edit the config block:

```cpp
const char* WIFI_SSID  = "your wifi name";
const char* WIFI_PASS  = "your wifi password";
const char* TG_USER_ID = "1052859174";   // your telegram id
```

no servo? set `#define HAS_SERVO 0`.

## 3. flash

1. plug in the droid via usb-c
2. tools → board → **M5CoreS3**
3. tools → port → pick the usb port (usbserial / wchusbserial)
4. hit upload (→ arrow)

## 4. use

- boots → connects wifi → joins the live feed
- which match it follows = app → me tab → droid card → **following** dropdown (auto = your latest pick). change it anytime, droid retargets within ~60s
- **demo mode for filming**: hold the screen while it boots → scripted match loop (goal → line move → yellow → red → full time), no wifi needed

## switch back to original firmware

your esptool backup restores everything:

```
python3 -m esptool write_flash 0x0 stackchan-backup.bin
```
