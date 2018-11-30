const Apify = require('apify');

const COUNTRIES_DIR = "countries"
const COUNTRIES_FILE = "list"

Apify.main(getCountriesList)

// Grab the list of countries => store in data
async function getCountriesList() {
    // Static list.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'https://en.wikipedia.org/wiki/Category:Lists_of_wars_by_country' },
        ],
    });
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
