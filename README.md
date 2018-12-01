Win-loss ratio by country - Wikipedia Scrape
-----

Quick scraping of https://en.wikipedia.org/wiki/Category:Lists_of_wars_by_country to estimate win/loss ratios in war by country. 

Word of warning - beside the general wikipedia/history-is-controversial caveat emptor, this is VERY fuzzy and should only be taking as a rough estimate for many reasons:
- "war" is an ambiguous word, some of these are more like battles, skirmishes, or conflicts. There's no sense of proportion - a flat-track bully's skirmish with a border tribe counts equally as winning World War II.
- The scrape works by matching column text for "Victory" or "Defeat", where most columns start out listing that as the result. But not all the tables follow that structure - ex. sometimes they describe "Other-country victory", which would get counted as a "victory" here when it's the opposite (ex: [Malta](https://en.wikipedia.org/wiki/List_of_wars_involving_Malta)). Or they discuss both victory and defeat so the text must be parsed in a less naive way to determine the actual meaning.
- A few pages aren't tables at all so could not be scraped. Notable ones include:
  - https://en.wikipedia.org/wiki/List_of_Byzantine_wars
  - https://en.wikipedia.org/wiki/List_of_Roman_wars_and_battles

### DATA

See all the results in [the full countries file](apify_storage/key_value_stores/countries/successes.json).
The "top victory" countries - the ones with at least 20 victories - are also listed in [the top countries file](apify_storage/key_value_stores/countries/successes_top.json).
Countries whose results could be not be scraped (due to unusual html structure, lack of tables etc) are collected [here](apify_storage/key_value_stores/errors/errored_countries.json).

**Conclusions**:
- [Brazil](https://en.wikipedia.org/wiki/List_of_wars_involving_Brazil) appears to come out on top with 26 victories and _0_ defeats out of 28 total.
- [The U.S.](https://en.wikipedia.org/wiki/List_of_wars_involving_the_United_States), at 97 victories + 10 defeats out of 118, and [the U.K.](https://en.wikipedia.org/wiki/List_of_wars_involving_the_United_Kingdom) at 115 victories + 18 defeats out of 156, are both as belligerent and successful as you'd expect.
- Most of the "winningest" countries are European, but [India](https://en.wikipedia.org/wiki/List_of_wars_involving_India) does shockingly well - 93 victories out of 107. Most of their victories appear to be "campaigns" and "expeditions" though, so YMMV.
- Malta appears to be invincible, until you realize it is [listing everything as victory (including victory by the enemy)](https://en.wikipedia.org/wiki/List_of_wars_involving_Malta).
  - [Italy](https://en.wikipedia.org/wiki/List_of_wars_involving_Italy) does rather well here by doing the same. Although they're genuinely not too shabby!

### DEVELOPMENT

Follow instructions in https://sdk.apify.com/docs/guides/gettingstarted to install the apify library, and clone the repo:
```
npm -g install apify-cli
git clone https://github.com/lishiyo/apify-wiki.git
cd apify-wiki
npm install
```

First grab the list of country urls from the index page by running:
```
npm run init
```
This stores all the country urls into [the list file](apify_storage/key_value_stores/countries/list.json).

Then using that list, scrape all their tables by running:
```
apify run --purge

// For debugging purposes, you can pluck out a few urls and add them to apify_storage/key_value_stores/test/single_country.json 
// then flip the TEST_RUN flag in main.js to true
```

The successful scrapes appear in [successes.json](apify_storage/key_value_stores/countries/successes.json), with "top" (>20 victory) countries in [the top-victory countries file](apify_storage/key_value_stores/countries/successes_top.json).

Some countries will error out because their link is following an non-conforming structure. They appear in [errored_countries.json](apify_storage/key_value_stores/errors/errored_countries.json).


### Todos

- fix those errored out countries if necessary
- parse into more readable, excel-sortable format as cv
- can we figure out the final result in a less naive way and cut down on the false positives/negatives?
- this code is gross, refactor
