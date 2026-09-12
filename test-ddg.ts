import { search } from 'duck-duck-scrape';
async function test() {
  const result = await search('uppsc official website');
  console.log(result.results.slice(0, 2));
}
test().catch(console.error);
