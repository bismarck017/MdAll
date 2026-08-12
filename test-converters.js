// Simple test script to verify ES module syntax and imports
import { convertTxtToMarkdown } from './js/converters/txtConverter.js';
import { convertJsonToMarkdown } from './js/converters/jsonConverter.js';
import { convertHtmlStringToMarkdown } from './js/converters/htmlConverter.js';

console.log('Testing TXT converter...');
const dummyTxtFile = {
    text: async () => 'Hello World\n\nThis is a test.'
};

convertTxtToMarkdown(dummyTxtFile).then(res => {
    console.log('TXT Output:\n', res);
});

console.log('\nTesting JSON converter...');
const dummyJsonFile = {
    text: async () => JSON.stringify([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }])
};

convertJsonToMarkdown(dummyJsonFile).then(res => {
    console.log('JSON Table Output:\n', res);
});
