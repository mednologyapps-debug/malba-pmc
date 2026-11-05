'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('dedicated price editor updates launch and regular prices atomically',()=>{
 const admin=fs.readFileSync('dashboard/cms.js','utf8');
 const server=fs.readFileSync('server.js','utf8');
 const sql=fs.readFileSync('scripts/sql/sync-book-prices.sql','utf8');
 assert.match(admin,/renderBookPriceEditor/);
 assert.match(admin,/\/api\/book-prices/);
 assert.doesNotMatch(admin,/\['physicalPrice','previewUrl'\]/);
 assert.match(server,/malba_set_book_prices/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.malba_set_book_prices/);
 assert.match(sql,/cms_documents/);
 assert.match(sql,/book_events/);
});
test('public checkout requires fresh canonical event price',()=>{
 const client=fs.readFileSync('publicaciones.js','utf8');
 const api=fs.readFileSync('event-system/api.js','utf8');
 assert.match(client,/fetch\('\/api\/events\/config'/);
 assert.match(client,/form\.dataset\.price=String\(cfg\.price\)/);
 assert.match(api,/const amount=priceAt\(commercial\)/);
 assert.match(api,/b\.expectedPrice!==amount/);
});
test('promotional checkout uses physical collection and concise UX',()=>{
 const renderer=fs.readFileSync('scripts/build_publications.py','utf8');
 const css=fs.readFileSync('publicaciones.css','utf8');
 assert.match(renderer,/Precio especial por lanzamiento/);
 assert.match(renderer,/Consejo Nacional del Colegio de Ingenieros/);
 assert.match(css,/max-height:none;overflow:visible/);
});

test('original desktop checkout layout preserved while scroll clip is removed',()=>{
 const css=fs.readFileSync('publicaciones.css','utf8');
 const js=fs.readFileSync('publicaciones.js','utf8');
 assert.match(js,/form\.dataset\.wizard = String\(mobile\.matches\)/);
 assert.match(css,/\.publications-page \.book-purchase\{position:static;top:auto;max-height:none;overflow:visible/);
});
