import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isMature,MATURE_TEXT} from '../worker/mature.js';
import {libraryCard,emptyProps} from '../scripts/build-library.mjs';
import {toCard} from '../scripts/build-starter.mjs';

test('mature topics are recognised from categories, titles and descriptions',()=>{
 for(const page of [
  {title:'Example',categories:['American pornographic film actresses']},
  {title:'Example',categories:['Category:Sex positions']},
  {title:'Example',categories:['Nudity']},
  {title:'Example',categories:['Prostitution in Europe']},
  {title:'Example',description:'American pornographic actress'},
  {title:'Example',description:'Playboy Playmate of the Month'},
  {title:'Anal sex'},
 ])assert.equal(isMature(page),true,JSON.stringify(page));
});

test('sexuality, health and look-alike words are not mature topics',()=>{
 for(const page of [
  {title:'Pornic',description:'commune in Loire-Atlantique, France'},
  {title:'Sexual orientation',categories:['Sexual orientation','Human sexuality']},
  {title:'Same-sex marriage',categories:['LGBTQ rights']},
  {title:'Sex education',categories:['Sex education','Reproductive health']},
  {title:'Rapeseed',categories:['Brassica']},
  {title:'Snuff',categories:['Snuff','Tobacco']},
  {title:'Paint stripper',description:'chemical used to remove paint'},
  {title:'Escort carrier',description:'type of aircraft carrier'},
 ])assert.equal(isMature(page),false,JSON.stringify(page));
});

test('the reader uses the same title and description rule as the Worker',()=>{
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(app.includes('const MATURE_TEXT_RE = '+MATURE_TEXT.toString()+';'));
 const settings=fs.readFileSync(new URL('../src/components/settings/ReadingPreferences.astro',import.meta.url),'utf8');
 assert.match(settings,/'dkMatureToggle' : 'matureToggle'/);
 assert.match(app,/showMature = settings\.mature === true/,'hidden unless the reader turned them on');
});

test('library and starter cards carry the mature flag',()=>{
 const body='An example article with enough text to be readable on a card in the feed. '.repeat(3);
 assert.equal(libraryCard(5,{namespace:0,title:'Example',opening_text:body,category:['Pornographic films']},emptyProps()).mature,1);
 assert.equal(libraryCard(5,{namespace:0,title:'Example',opening_text:body,category:['Lakes']},emptyProps()).mature,undefined);
 assert.equal(toCard({pageid:5,title:'Example',description:'American pornographic actress',extract:body,thumbnail:{source:'https://upload.wikimedia.org/x.jpg'}},'wiki').mature,1);
});

test('German, French and Spanish categories have their own mature rules', () => {
  assert.equal(isMature({title: 'X', categories: ['Kategorie:Pornografie'], lang: 'de'}), true);
  assert.equal(isMature({title: 'X', categories: ['Catégorie:Viol'], lang: 'fr'}), true);
  assert.equal(isMature({title: 'X', categories: ['Categoría:Prostitución'], lang: 'es'}), true);
  // Whole words only: a violinist or a German painter is not flagged.
  assert.equal(isMature({title: 'X', categories: ['Catégorie:Violoniste français'], lang: 'fr'}), false);
  assert.equal(isMature({title: 'X', categories: ['Kategorie:Maler (Deutschland)'], lang: 'de'}), false);
  // A language without rules checks only the title and description.
  assert.equal(isMature({title: 'X', categories: ['Categoria:Pornografia'], lang: 'it'}), false);
});
