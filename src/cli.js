const { findCommands } = require('./index');

const run = async () => {
    const cmdProcessors = await findCommands("_generators");

    const printHelp = (cmd) => {
        if (cmd) {
            console.log(`help for ${cmd.cmd} will go here someday.`);
        } else {
            console.log("sparkgen [generator] [generator-arguments]\n");
            console.log("Available generators:");
            cmdProcessors.forEach(cmdP => {
                console.log(`\t${cmdP.cmd}\tAliases: ${cmdP.aliases}`)
            });
        }
    }
    const argv = require('minimist')(process.argv.slice(2));

    const cmd = argv._[0];
    const cmdExec = cmdProcessors.find(p => p.cmd == cmd || (p.aliases && p.aliases.includes(cmd)));

    if (!cmdExec) {
        if (cmd) { console.log(`No generator: ${cmd}.\n`); }
        
        printHelp();
    } else {
        const actions = await cmdExec.run(argv, () => printHelp(cmdExec));

        if (actions && actions.length > 0) {
            console.log("")
            actions.forEach(a => {
                console.log(`\t${a.action}: ${a.outputPath}`);
            });
        }
    }
}

run();
