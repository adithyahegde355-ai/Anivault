# AniVault

Anime finder with official posters, descriptions, trailers and a wishlist. Data from the free Jikan API (MyAnimeList). No account, no key.

## Get the APK (free, no software to install)

1. On GitHub, create a **new repository** (for example `anivault`, Public).
2. Click **Add file → Upload files**. Open this unzipped folder, select the **loose files** (`index.html`, `style.css`, `app.js`, `icon.png`, `package.json`, `capacitor.config.json`, `.gitignore`, `README.md`) and drag them in. There are no folders to upload. Click **Commit changes**.
3. Click **Add file → Create new file**. In the name box type exactly `.github/workflows/build.yml`. Open `build.yml` from this folder in Notepad, copy everything, paste it into the big text area, then click **Commit changes** (twice).
4. Open the **Actions** tab. A "Build APK" run starts by itself (about 5 to 10 minutes). Wait for the green tick.
5. On the repository's main page open **Releases** (right side) and download **AniVault.apk**. Install it on your **Android phone** (it will not open on Windows).

If the build shows a red cross, open the red step and send the error text.

## Notes
- Posters, descriptions and trailer links come from MyAnimeList through Jikan. Trailers play inside the app from YouTube; if one will not play, tap "Open on YouTube".
- The wishlist is saved on your phone only.
- The "Where to watch" buttons open the official streaming sites listed for each anime.
