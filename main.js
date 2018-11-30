const Apify = require('apify');

const COUNTRIES_DIR = "countries"
const COUNTRIES_FILE = "list"

const TEST_DIR = "test"
const TEST_FILE = "single_country"

const ERROR_DIR = "errors"
const ERROR_FILE = "errored_countries"

// Apify.main(getCountriesList)
Apify.main(getSingleCountryData)

// Grab the list of countries => store in data
async function getCountriesList() {
    // Static list.
    const input = await Apify.getValue('INPUT');
    if (!input) throw new Error('Have you passed the correct INPUT ?');
    const { sources } = input;
    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        // Static initial list
        requestList,

        launchPuppeteerOptions: { 
            // headless: true,
            maxRequestRetries: 1,
        },

        handlePageFunction: async ({ page, request }) => {
            const hrefs = await page.evaluate(() => {
                const elements = document.querySelectorAll('.mw-category-group a');
                
                return Array
                .from(elements)
                // we only want the actual wars
                .filter(element => {
                    return element.getAttribute("href").includes("war")
                })
                .map(element => "https://en.wikipedia.org" + element.getAttribute("href") );
            });
            console.log("TOTAL LINKS FOUND: ", hrefs.length);
            // skip 

            // Now save the data!
            const store = await Apify.openKeyValueStore(COUNTRIES_DIR);
            const countries = hrefs.map(href => {
                return {
                    url: href,
                }
            });
            const list = {
                sources: countries
            };

            await store.setValue(COUNTRIES_FILE, list);
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler.
    await crawler.run();
}

async function getSingleCountryData() {
    const store = await Apify.openKeyValueStore(COUNTRIES_DIR);
    const input = await store.getValue(COUNTRIES_FILE);
    // const store = await Apify.openKeyValueStore(TEST_DIR);
    // const input = await store.getValue(TEST_FILE);
    
    if (!input) throw new Error('Have you passed the correct INPUT ?');
    const { sources } = input;

    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();

    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();
    // await requestQueue.addRequest(new Apify.Request({ url: URL }));

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        // Static initial list
        requestList,

        // Queue to stack more urls onto
        requestQueue,

        launchPuppeteerOptions: { 
            headless: true,
            maxRequestRetries: 1,
        },

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        // Parameter page is Puppeteers page object with loaded page.
        handlePageFunction: async ({ page, request }) => {
            const DEFEATED_MARKER = 'defeat';
            const VICTORY_MARKER = 'victory';

            const title = await page.title();
            // grab the country from the title
            const regex = title.match("List of wars (?:involving|in) (.*) -")
            if (!regex || regex.length < 2) {
                await storeError(country, request.url);
                return;
            }
            const country = regex[1];

            // https://pptr.dev/#?product=Puppeteer&version=v1.10.0&show=api-class-elementhandle
            // const allRows = await page.$$(ALL_ROW_SELECTOR);
            const allRows = await page.evaluate(() => {
                const wikitables = document.querySelectorAll('table')
                
                // loop through all tables for those with RESULT column
                let warTables = new Map();
                
                for (let i = 0; i < wikitables.length; i++) {
                    let currentTable = wikitables[i];
                    // header column
                    let columns = currentTable.rows[0].cells;
                    for (let j = 0; j < columns.length; j++) {
                        let columnName = columns[j].innerText.toLowerCase();
                        if (columnName.includes("result") || columnName.includes("outcome") || columnName.includes("conclusion")) {
                            // add 1 because css isn't zero-indexed
                            warTables.set(j+1, currentTable);
                            continue;
                        }
                    }
                }

                // loop through each 
                let elements = [];
                for (let [resultColumnIndex, table] of warTables) {
                    const tableElements = table.querySelectorAll(`td:nth-child(${resultColumnIndex})`);
                    elements = elements.concat(Array.from(tableElements));
                }
                
                return elements.map(element => element.innerText.toString().toLowerCase() )
            });
        
            // calculate how many contain victory and defeat regex
            const defeats = [];
            const victories = [];
            for (let i = 0; i < allRows.length; i++) {
                let txt = allRows[i];
                let hasDefeated = txt.includes(DEFEATED_MARKER);
                let hasVictory = txt.includes(VICTORY_MARKER);

                if (hasDefeated) {
                    defeats.push(txt)
                } else if (hasVictory) {
                    victories.push(txt)
                }
            }
            const victoriesCount = victories.length;
            const winLossRatio = (victoriesCount/parseFloat(defeats.length)).toFixed(2);
            const winPercentage = ((victoriesCount/parseFloat(allRows.length)).toFixed(2))*100;


            if (victoriesCount === 0 && defeats.length === 0) {
                // probably messed up, save to another file
                await storeError(country, request.url);
            } else {
                console.log(`SUCCESS!! ${country} with ${allRows.length} total => ${defeats.length} defeats, ${victoriesCount} victories => winPercentage: ${winPercentage}`);

                // Save data.
                await Apify.pushData({
                    url: request.url,
                    title,
                    country,
                    totalWars: allRows.length,
                    totalDefeats: defeats.length,
                    winLossRatio,
                    winPercentage,
                });

            }

        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler.
    await crawler.run();
}

async function storeError(country, url) {
    // probably messed up, save to another file
    console.log(`ERROR === ${country}`)
    // Save the messed up countries
    const store = await Apify.openKeyValueStore(ERROR_DIR);
    const currentErrors = await store.getValue(ERROR_FILE);
    const erroredCountries = currentErrors.sources; // array
    // push ours onto the error
    erroredCountries.push({
        url: url,
    });
    const list = {
        sources: erroredCountries
    };

    await store.setValue(ERROR_FILE, list);
}