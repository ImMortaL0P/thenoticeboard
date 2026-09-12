import google from 'googlethis';
async function test() {
  const options = {
    page: 0, 
    safe: false,
    parse_ads: false,
    additional_params: { hl: 'en' }
  };
  const response = await google.search('UPPSC official website', options);
  console.log(response.results.slice(0, 2));
}
test().catch(console.error);
