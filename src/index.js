const fs = require('fs');
const util = require('util');
const path = require('path');

const exists = util.promisify(fs.exists);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const appendFile = util.promisify(fs.appendFile);
const readdir = util.promisify(fs.readdir);
const mkdir = util.promisify(fs.mkdir);

const trimEnding = (str, ending) => str.endsWith(ending) ? str.substring(0, str.length - ending.length) : str;

const generateFile = async (inputPath, outputPath, replacements, options = {}) => {
  let action = 'A';

  const inputStr = await readFile(inputPath, "utf8");
  const outputStr = applyReplacements(inputStr, replacements);

  if (await exists(outputPath)) {
    const currentOutputStr = await readFile(outputPath, "utf8");
    if (outputStr == currentOutputStr) {
      console.log(`${outputPath} exists and is identical. Skipping.`);
      return { action: 'I', outputPath, original: options.original };
    }
    else if (!options.overwrite) {
      console.log(`${outputPath} already exists. Skipping.`);
      return { action: 'S', outputPath, original: options.original };
    } else {
      console.log(`${outputPath} already exists. Overwriting.`);
      action = 'M';
    }
  }

  await ensureDirectory(outputPath);
  await writeFile(outputPath, outputStr, { encoding: "utf8" });
  return { action, outputPath, original: options.original };
};


const generateExports = async (indexPath, actions, exportFn) => {
  const addActions = actions.filter(a => a.action == "A");
  const exports = addActions.map(exportFn);

  const indexActions = [];

  if (exports.length > 0) {
    const exportStr = exports.join("\n");

    if (await exists(indexPath)) {
      await appendFile(indexPath, `\n${exportStr}`, { encoding: "utf8" });
      indexActions.push({ action: "M", outputPath: indexPath });
    } else {
      await ensureDirectory(indexPath);
      await writeFile(indexPath, exportStr, { encoding: "utf8" });
      indexActions.push({ action: "A", outputPath: indexPath });
    }
  }

  return indexActions;
}

// group by file

const groupByArray = (xs, key) => {
  return xs.reduce((rv, x) => {
    let v = key instanceof Function ? key(x) : x[key];
    let el = rv.find((r) => r && r.key === v);
    if (el) { el.values.push(x); }
    else { rv.push({ key: v, values: [x] }); }
    return rv;
  }, []);
}

const generateExportsTwo = async (exportActions) => {

  const commonExports = groupByArray(exportActions, 'index')
    .map(e => ({
      index: e.key,
      exports: e.values.map(v => v.export)
    }));

  const promises = commonExports.filter(e => e.exports.length > 0).map(async e => {
    const exportStr = e.exports.join("\n");

    if (await exists(e.index)) {
      await appendFile(e.index, `\n${exportStr}`, { encoding: "utf8" });
      return { action: "M", outputPath: e.index };
    } else {
      await ensureDirectory(e.index);
      await writeFile(e.index, exportStr, { encoding: "utf8" });
      return { action: "A", outputPath: e.index };
    };
  });

  const indexActions = await Promise.all(promises);

  return indexActions;
}

const findCommands = async (dir) => {
  if (!await exists(dir)) { return []; }
  const commands = await readdir(dir);
  const jsCommandsFiles = commands.filter(c => c.endsWith(".js"));

  const jsCommands = jsCommandsFiles
    .map(jsFile => {
        const jsAbsolutePath = `${process.cwd()}${path.sep}${path.join(dir, jsFile)}`;

      return __non_webpack_require__(jsAbsolutePath);
    })
    .filter(c => c.cmd)

  return jsCommands;
}

const templateGenerator = (cmd, aliases, varsFn) => {
  return {
    cmd: cmd,
    aliases,
    run: async (argv, help) => {
      const overwrite = argv.f || argv.force;

      argv._.shift();

      if (argv._.length < 1) {
        help();
        return;
      }

      const actions = await Promise.all(argv._.map(s => generateTemplatedFile(s, overwrite, varsFn)));

      const addActions = actions.filter(a => a.action == "A");
      const exportActions = addActions
        .filter(a => !a.original.noIndex)
        .map(a => ({ index: a.original.indexPath, export: a.original.exports }));

      const resultActions = await generateExportsTwo(exportActions);

      return actions.concat(resultActions);
    }
  }
}

exports.trimEnding = trimEnding;
exports.generateFile = generateFile;
exports.generateExports = generateExports;
exports.findCommands = findCommands;
exports.templateGenerator = templateGenerator;

const generateTemplatedFile = async (name, overwrite, varsFn) => {
  const vars = varsFn(name);

  const inputPath = `_generators/templates/${vars.template}`;
  const outputPath = `${vars.root}/${vars.output}`;

  const indexPath = `${vars.root}/${vars.index || 'index.ts'}`;
  const exports = vars.exports;

  return await generateFile(inputPath, outputPath, vars.replacements, {
    overwrite, original: {
      indexPath,
      exports,
      noIndex: vars.noIndex
    }
  });
}


const applyReplacements = (str, replacements) => {
  var result = str;

  replacements.forEach(replacement => {
    result = result.replace(replacement.r, replacement.v);
  });

  return result;
};

const ensureDirectory = async (filePath) => {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
}