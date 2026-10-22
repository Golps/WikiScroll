import fs from 'node:fs';

// Style assertions inspect the ordered editable sources, not minifier formatting.
export function readStyles(url=new URL('../../src/styles/reader.css',import.meta.url)) {
  return fs.readFileSync(url,'utf8').replace(/@import\s+"(\.\/[^\"]+)";/g,(_,file)=>readStyles(new URL(file,url)));
}
