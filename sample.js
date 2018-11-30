const Apify = require('apify');

// Apify.main(async () => {
//     const requestQueue = await Apify.openRequestQueue();
//     await requestQueue.addRequest({ url: 'https://www.iana.org/' });
//     const pseudoUrls = [new Apify.PseudoUrl('https://www.iana.org/[.*]')];

//     const crawler = new Apify.PuppeteerCrawler({
//         requestQueue,
//         handlePageFunction: async ({ request, page }) => {
//             const title = await page.title();
//             console.log(`Title of ${request.url}: ${title}`);
//             await Apify.utils.puppeteer.enqueueLinks(page, 'a', pseudoUrls, requestQueue);
//         },
//         maxRequestsPerCrawl: 100,
//         maxConcurrency: 10,
//     });

//     await crawler.run();
// });

Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains the start URL.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'https://news.ycombinator.com/' },
        ],
    });
    await requestList.initialize();

    // Apify.openRequestQueue() is a factory to get a preconfigured RequestQueue instance.
    const requestQueue = await Apify.openRequestQueue();

    // Create an instance of the PuppeteerCrawler class - a crawler
    // that automatically loads the URLs in headless Chrome / Puppeteer.
    const crawler = new Apify.PuppeteerCrawler({
        // The crawler will first fetch start URLs from the RequestList
        // and then the newly discovered URLs from the RequestQueue
        requestList,
        requestQueue,

        // Here you can set options that are passed to the Apify.launchPuppeteer() function.
        // For example, you can set "slowMo" to slow down Puppeteer operations to simplify debugging
        launchPuppeteerOptions: { slowMo: 500 },

        // Stop crawling after several pages
        maxRequestsPerCrawl: 10,

        // This function will be called for each URL to crawl.
        // Here you can write the Puppeteer scripts you are familiar with,
        // with the exception that browsers and pages are automatically managed by the Apify SDK.
        // The function accepts a single parameter, which is an object with the following fields:
        // - request: an instance of the Request class with information such as URL and HTTP method
        // - page: Puppeteer's Page object (see https://pptr.dev/#show=api-class-page)
        handlePageFunction: async ({ request, page }) => {
            console.log(`Processing ${request.url}...`);

            // A function to be evaluated by Puppeteer within the browser context.
            const pageFunction = ($posts) => {
                const data = [];

                // We're getting the title, rank and URL of each post on Hacker News.
                $posts.forEach(($post) => {
                    data.push({
                        title: $post.querySelector('.title a').innerText,
                        rank: $post.querySelector('.rank').innerText,
                        href: $post.querySelector('.title a').href,
                    });
                });

                console.log("pageFunction finished pushing data for each post");
                return data;
            };
            const data = await page.$$eval('.athing', pageFunction);

            // Store the results to the default dataset.
            await Apify.pushData(data);

            // Find the link to the next page using Puppeteer functions.
            let nextHref;
            try {
                nextHref = await page.$eval('.morelink', el => el.href);
            } catch (err) {
                console.log(`${request.url} is the last page!`);
                return;
            }

            // Enqueue the link to the RequestQueue
            await requestQueue.addRequest(new Apify.Request({ url: nextHref }));
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});


// Apify.main(async () => {
//     // Get queue and enqueue first url.
//     const requestQueue = await Apify.openRequestQueue();
//     await requestQueue.addRequest(new Apify.Request({ url: 'https://news.ycombinator.com/' }));

//     // Create crawler.
//     const crawler = new Apify.PuppeteerCrawler({
//         requestQueue,

//         // This page is executed for each request.
//         // If request failes then it's retried 3 times.
//         // Parameter page is Puppeteers page object with loaded page.
//         handlePageFunction: async ({ page, request }) => {
//             const title = await page.title();
//             const posts = await page.$$('.athing');

//             console.log(`Page ${request.url} succeeded and it has ${posts.length} posts.`);

//             // Save data.
//             await Apify.pushData({
//                 url: request.url,
//                 title,
//                 postsCount: posts.length,
//             });
//         },

//         // If request failed 4 times then this function is executed.
//         handleFailedRequestFunction: async ({ request }) => {
//             console.log(`Request ${request.url} failed 4 times`);
//         },
//     });

//     // Run crawler.
//     await crawler.run();
// });
