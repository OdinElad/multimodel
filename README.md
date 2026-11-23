# Tahazit: Weather Forecast

A free, open-source weather app that compares forecasts from the world's leading numerical weather models side by side (ECMWF, GFS, ICON, UKMO, Météo-France) and shows where they agree or disagree.

**Live app:** https://odinelad.github.io/multimodel/

## Features
- Median of all models, with outlier detection
- Storm, heavy-rain and wind alerts based on model consensus
- 7-day forecast with a confidence score per day, hourly table and comparison chart
- Everyday answers: laundry, running, watering the garden
- Nearby station observation (Israel Meteorological Service in Israel, METAR worldwide)
- 14 languages, metric or imperial units, saved per user
- Installable as a web app (PWA), works offline with the last saved forecast

## Data sources and attribution
- Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The data is processed by this app: medians, averages, confidence scores and alerts are derived from it, and units are converted. Open-Meteo does not endorse this project.
- Place search: Open-Meteo Geocoding API, based on GeoNames (CC BY 4.0).
- Observations in Israel: Israel Meteorological Service (IMS). The IMS is not responsible for the data or its use, and is not a party to its publication in this app.
- Observations elsewhere: NOAA Aviation Weather Center (METAR), public domain.

## Structure
- `index.html` the whole app (HTML, CSS, JS)
- `server/api.php` small station-observation proxy (runs on PHP hosting, keeps API tokens private, caches results for 10 minutes)
- `server/config.example.php` copy to `config.php` next to `api.php` and add the IMS token

Forecasts are computer model output and do not replace official warnings from your national weather service.

Built by Elad Elimelech. Free, no ads, non-commercial.
