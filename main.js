const Apify = require('apify');

const COUNTRIES_DIR = "countries"
const COUNTRIES_SUCCESS_FILE = "successes"

const TEST_DIR = "test"
const TEST_FILE = "single_country"

const ERROR_DIR = "errors"
const ERROR_FILE = "errored_countries"

Apify.main(getPerCountryResults)

async function getPerCountryResults() {
    // First clear the successes and errors files for a clean run
    await clearResultFiles();

    // const store = await Apify.openKeyValueStore(COUNTRIES_DIR);
    // const input = await store.getValue(COUNTRIES_FILE);
    const store = await Apify.openKeyValueStore(TEST_DIR);
    const input = await store.getValue(TEST_FILE);
    
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
                await storeError("UNKNOWN", request.url);
                return;
            }
            const country = regex[1];

            // https://pptr.dev/#?product=Puppeteer&version=v1.10.0&show=api-class-elementhandle
            // const allRows = await page.$$(ALL_ROW_SELECTOR);
            const allRows = await page.evaluate(() => {
                const wikitables = document.querySelectorAll('table')
                
                // loop through all tables for those with RESULT column
                // map of columnIdx => [table1, table2]
                let warTables = new Map();
                
                for (let i = 0; i < wikitables.length; i++) {
                    let currentTable = wikitables[i];
                    // header column
                    let columns = currentTable.rows[0].cells;
                    for (let j = 0; j < columns.length; j++) {
                        let columnName = columns[j].innerText.toLowerCase();
                        if (columnName.includes("result") || columnName.includes("outcome") || columnName.includes("conclusion")) {
                            // add 1 because css isn't zero-indexed
                            let currentTables = warTables.has(j+1) ? warTables.get(j+1) : [];
                            currentTables.push(currentTable);
                            warTables.set(j+1, currentTables);
                            continue;
                        }
                    }
                }

                // loop through each 
                let elements = [];
                for (let [resultColumnIndex, tables] of warTables) {
                    tables.forEach(table => {
                        const tableElements = table.querySelectorAll(`td:nth-child(${resultColumnIndex})`);
                        elements = elements.concat(Array.from(tableElements));
                    })
                }
                
                return elements.map(element => element.innerText.toString().toLowerCase() )
            });
        
            console.log("allRows", allRows);
            // calculate how many contain victory and defeat regex
            const defeats = [];
            const victories = [];
            for (let i = 0; i < allRows.length; i++) {
                let txt = allRows[i];
                let hasVictory = txt.includes(VICTORY_MARKER);
                let hasDefeated = !hasVictory && txt.includes(DEFEATED_MARKER);

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

                const data = {
                    url: request.url,
                    title,
                    country,
                    totalWars: allRows.length,
                    totalDefeats: defeats.length,
                    totalVictories: victoriesCount,
                    winLossRatio,
                    winPercentage,
                };

                // Save individual data.
                await Apify.pushData(data);

                // Save to flat file.
                await storeSuccess(data);
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
    const current = await store.getValue(ERROR_FILE);
    const sources = current.sources; // array
    // push ours onto the error
    sources.push({
        url: url,
    });
    const list = {
        sources: sources
    };

    await store.setValue(ERROR_FILE, list);
}

async function storeSuccess(data) {
     const store = await Apify.openKeyValueStore(COUNTRIES_DIR);
     const current = await store.getValue(COUNTRIES_SUCCESS_FILE);
     const sources = current.sources; // array
     sources.push(data)

     const list = {
        sources: sources
    };
    await store.setValue(COUNTRIES_SUCCESS_FILE, list);
}

async function clearResultFiles() {
    const success_store = await Apify.openKeyValueStore(COUNTRIES_DIR);
    const errors_store = await Apify.openKeyValueStore(ERROR_DIR);
    const list = {
        sources: []
    };
    await success_store.setValue(COUNTRIES_SUCCESS_FILE, list);
    await errors_store.setValue(ERROR_FILE, list);
}
