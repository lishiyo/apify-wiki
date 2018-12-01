const Apify = require('apify');

const COUNTRIES_DIR = "countries"
const COUNTRIES_FILE = "list"
const COUNTRIES_SUCCESS_FILE = "successes"
const TOP_COUNTRY_THRESHOLD = 20 
const COUNTRIES_TOP_SUCCESS_FILE = "successes_top"

const TEST_DIR = "test"
const TEST_FILE = "single_country"

const ERROR_DIR = "errors"
const ERROR_FILE = "errored_countries"

// Flip this flag to run the test folder input instead
const TEST_RUN = false;

Apify.main(getPerCountryResults)

/**
 * Walks through every country url in the COUNTRIES_FILE list and scrapes their tables.
 * Stores the successful scrapes in COUNTRIES_SUCCESS_FILE.
 * Stores the errored scrapes in ERROR_FILE
 */
async function getPerCountryResults() {
    // First clear the successes and errors files for a clean run
    await clearResultFiles();
    
    let store, input;
    if (TEST_RUN) {
        store = await Apify.openKeyValueStore(TEST_DIR);
        input = await store.getValue(TEST_FILE);
    } else {
        store = await Apify.openKeyValueStore(COUNTRIES_DIR);
        input = await store.getValue(COUNTRIES_FILE);
    }
    
    if (!input) throw new Error('Have you passed the correct INPUT ?');
    const { sources } = input;
    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();
    
    // Create puppeteer crawler.
    const crawler = new Apify.PuppeteerCrawler({
        // Static initial list
        requestList,
        
        launchPuppeteerOptions: { 
            headless: true,
            maxRequestRetries: 1,
        },
        
        // This page is executed for each request.
        // Parameter page is Puppeteers page object with loaded page.
        handlePageFunction: async ({ page, request }) => {
            const DEFEATED_MARKER = "defeat";
            const VICTORY_MARKER = "victory";
           
            // Figure out the country name from the title.
            const title = await page.title();
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
                // Map of "result column index" => [table1, table2] 
                let warTables = new Map();
                
                for (let i = 0; i < wikitables.length; i++) {
                    let currentTable = wikitables[i];
                    let columns = currentTable.rows[0].cells;
                    // The header row may have some columns spanning multiple
                    // of the final content columns, so need to calculate final column index
                    let finalColumnCount = 0; // reset for each table
                    for (let j = 0; j < columns.length; j++) {
                        let columnName = columns[j].innerText.toLowerCase();
                        let colSpan = columns[j].hasAttribute('colspan') ? parseInt(columns[j].getAttribute('colspan')) : 1
                        finalColumnCount += colSpan
                        if (columnName.includes("result") || columnName.includes("outcome") || columnName.includes("conclusion")) {
                            let currentTables = warTables.has(finalColumnCount) ? warTables.get(finalColumnCount) : [];
                            currentTables.push(currentTable);
                            warTables.set(finalColumnCount, currentTables);
                            continue;
                        }
                    }
                }
                
                // loop through each table and grab the text from their result column index
                let elements = [];
                for (let [resultColumnIndex, tables] of warTables) {
                    tables.forEach(table => {
                        const tableElements = table.querySelectorAll(`td:nth-child(${resultColumnIndex})`);
                        elements = elements.concat(Array.from(tableElements));
                    })
                }
                
                return elements.map(element => element.innerText.toString())
            });
            
            // calculate how many contain victory and defeat regex
            const defeats = [];
            const victories = [];
            for (let i = 0; i < allRows.length; i++) {
                let txt = allRows[i].toLowerCase();
                let victoryIdx = txt.indexOf(VICTORY_MARKER);
                let defeatIdx = txt.indexOf(DEFEATED_MARKER);
                if (victoryIdx === -1 && defeatIdx === -1) {
                    // no victory or defeat mentioned at all
                    continue;
                }
                
                // Victory or Defeat as a "title" takes precendence
                // if none, then whichever one comes first or solo in the text
                let definitelyVictory = (allRows[i].includes("<b>Victory</b>") || allRows[i].includes("Victory"))
                let definitelyDefeat = (allRows[i].includes("<b>Defeat</b>") || allRows[i].includes("Defeat"))

                if (definitelyVictory) {
                    victories.push(txt)
                } else if (definitelyDefeat) {
                    defeats.push(txt)
                } else if (victoryIdx >= 0 && (defeatIdx === -1 || victoryIdx <= defeatIdx)) {
                    victories.push(txt)
                } else if (defeatIdx >= 0 && (victoryIdx === -1 || defeatIdx <= victoryIdx)) {
                    defeats.push(txt)
                }
            }
            const victoriesCount = victories.length;
            const winLossRatio = (victoriesCount/parseFloat(defeats.length)).toFixed(2);
            const winPercentage = ((victoriesCount/parseFloat(allRows.length)).toFixed(2))*100;
            
            if (victoriesCount === 0 && defeats.length === 0) {
                // no victory or defeat anywhere - probably something messed up in scrape, store in file to investigate
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
                
                // Save individual country data.
                await Apify.pushData(data);
                
                // Append to our main file.
                await storeSuccess(data, victoriesCount >= TOP_COUNTRY_THRESHOLD);
            }
        },
        
        // If request failed X times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });
    
    // Run crawler.
    await crawler.run();
}

/**
 * Add the country url to the errors file.
 * 
 * @param {string} country The title of the country
 * @param {string} url The url to save
 */
async function storeError(country, url) {
    console.log(`ERROR === ${country}`)
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

/**
 * Add the country data to the final results file.
 * @param {object} data The country result data.
 * @param {boolean} storeInTop Whether to save the country data to the "top countries" file as well.
 */
async function storeSuccess(data, storeInTop) {
    const store = await Apify.openKeyValueStore(COUNTRIES_DIR);
    const current = await store.getValue(COUNTRIES_SUCCESS_FILE);
    const sources = current.sources; // array
    sources.push(data)
    
    const list = {
        sources: sources
    };
    await store.setValue(COUNTRIES_SUCCESS_FILE, list);
    
    // if the victory count is >= 20, store it in the top file as well
    if (storeInTop) {
        const currentTop = await store.getValue(COUNTRIES_TOP_SUCCESS_FILE);
        currentTop.sources.push(data)
        const currentTopList = {
            sources: currentTop.sources
        }
        await store.setValue(COUNTRIES_TOP_SUCCESS_FILE, currentTopList);
    }
}

/**
 * Clear out the data files on each run.
 */
async function clearResultFiles() {
    const success_store = await Apify.openKeyValueStore(COUNTRIES_DIR);
    const errors_store = await Apify.openKeyValueStore(ERROR_DIR);
    const list = {
        sources: []
    };
    await success_store.setValue(COUNTRIES_SUCCESS_FILE, list);
    await success_store.setValue(COUNTRIES_TOP_SUCCESS_FILE, list);
    await errors_store.setValue(ERROR_FILE, list);
}
