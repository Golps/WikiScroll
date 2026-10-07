import test from 'node:test';
import assert from 'node:assert/strict';
import {isDisambiguation} from '../worker/travel.js';

const guide = (title, extract) => ({title, extract});

test('disambiguation pages are recognised in every edition', () => {
  for (const title of ['Goiás (desambiguação)', 'Georgia (disambiguation)', 'Paris (homonymie)', 'Georgia (Begriffsklärung)', 'Córdoba (desambiguación)', 'Lima (disambigua)', 'Бостон (значения)', '府中 (曖昧さ回避)', '长安 (消歧义)'])
    assert.equal(isDisambiguation({title}), true, title);
  assert.equal(isDisambiguation({title: 'Goiás'}), false);
  assert.equal(isDisambiguation({title: 'Georgia', description: 'topics referred to by the same term'}), true);
});
