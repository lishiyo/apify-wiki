[WIP] Win-loss ratio by country - Wikipedia Scrape
-----

Quick scraping of https://en.wikipedia.org/wiki/Category:Lists_of_wars_by_country to estimate win/loss ratios in war by country. Word of warning: this is VERY fuzzy. 

### DATA

See the current results in [successes.json](public/successes.json).
Countries whose results could be not be scraped (due to unusual html structure) are listed [here](public/errored_countries.json).

Todos:
- fix those errored out countries
- parse into more readable, excel-sortable format as csv

### DEVELOPMENT

Clone the repo.

Follow instructions in https://sdk.apify.com/docs/guides/gettingstarted to install the apify library:
```
npm -g install apify-cli
cd apify-wars
// *might* need an apify account, shouldn't need one
```

First grab the list of country urls by uncommenting `getCountriesList`:
```
Apify.main(getCountriesList)
// and comment out the line after it
// Apify.main(getSingleCountryData)
```

Run `apify run --purge`.

This should scrape the country urls into `apify_storage/key_value_stores/countries/list.json`.

Then scrape the per-country tables by switching to the other function:
```
// Comment out 
// Apify.main(getCountriesList)
// and UN-comment out
Apify.main(getSingleCountryData)
```

Some countries will error out because their link is following an non-conforming structure. 