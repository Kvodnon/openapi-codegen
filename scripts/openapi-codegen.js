import {program} from 'commander';
import inquirer from 'inquirer';
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line import/no-useless-path-segments,import/extensions
import {GiteaApi} from './gitea-api/index.js';
// eslint-disable-next-line import/no-useless-path-segments,import/extensions
import {openapiBundler} from './openapi-bundler/index.js';

console.info('import: ', import.meta.dirname);

const CLI_OPTIONS = program.opts();
// Defaults can be overridden via CLI options or environment variables
const DEFAULT_GITEA_BASE_DOMAIN = process.env.GITEA_BASE_DOMAIN || '';
const DEFAULT_GITEA_REPO_OWNER = process.env.GITEA_REPO_OWNER || '';
const DEFAULT_GITEA_REPO_NAME = process.env.GITEA_REPO_NAME || '';
const REPO_YAML_FILENAME = 'api.yml';
const OUTPUT_YAML_FILENAME = 'openapi-schema.yml';
const OUTPUT_TS_FILENAME = 'openapi-schema.ts';
const OUTPUT_DIRECTORIES = fs
    .readdirSync(path.resolve(import.meta.dirname, '../src'), {withFileTypes: true})
    .filter((dir) => dir.isDirectory())
    .map((dir) => dir.name);
const TEMP_MULTIFILE_SPECS_PATH = path.resolve(import.meta.dirname, '../src/__openapi_codegen_temp__');

program
    .option('-t, --token <type>', 'Gitea API Token')
    .option('-rt, --refType <type>', 'OpenAPI Git version type (can be "tag" | "branch" | "commit")')
    .option('-r, --ref <type>', 'The name of the OpenAPI repository tag/branch/commit')
    .option('-mf, --multiFile', 'Bundle a multi-file API definition into a single file')
    .option('-yd, --openapiYamlRepoDir <type>', 'Directory name where OpenAPI YAML is stored (e.g.: "logistics")')
    .option(
        '-yf, --openapiYamlRepoFilename <type>',
        `Name of the OpenAPI YAML file in repository (default is "${REPO_YAML_FILENAME}")`,
        REPO_YAML_FILENAME,
    )
    .option('-ys, --openapiYamlSave', 'Do not delete downloaded/bundled YAML spec after generating TypeScript file')
    .option('-o, --openapiTsOutputDir <type>', 'Select output directory where to save generated Schema')
    .option('--gitea-base-domain <type>', 'Gitea base domain (e.g. git.example.com)', DEFAULT_GITEA_BASE_DOMAIN)
    .option('--gitea-repo-owner <type>', 'Gitea repository owner (e.g. MyOrg)', DEFAULT_GITEA_REPO_OWNER)
    .option('--gitea-repo-name <type>', 'Gitea repository name (e.g. openapi)', DEFAULT_GITEA_REPO_NAME)
    .parse();

async function inquire() {
    return await inquirer.prompt([
        {
            type: 'input',
            name: 'token',
            message: 'Gitea API Token:',
            validate: (value) => (String(value).trim().length > 0 ? true : 'This field is required'),
            when: !CLI_OPTIONS['token'],
        },
        {
            type: 'list',
            name: 'refType',
            message: 'OpenAPI Git version type:',
            choices: ['tag', 'branch', 'commit'],
            when: !CLI_OPTIONS['refType'],
        },
        {
            type: 'input',
            name: 'giteaBaseDomain',
            message: 'Gitea base domain:',
            default: () => CLI_OPTIONS['giteaBaseDomain'] || DEFAULT_GITEA_BASE_DOMAIN,
            validate: (value) => (String(value).trim().length > 0 ? true : 'This field is required'),
            when: () => !CLI_OPTIONS['giteaBaseDomain'] && !DEFAULT_GITEA_BASE_DOMAIN,
        },
        {
            type: 'input',
            name: 'giteaRepoOwner',
            message: 'Gitea repository owner:',
            default: () => CLI_OPTIONS['giteaRepoOwner'] || DEFAULT_GITEA_REPO_OWNER,
            validate: (value) => (String(value).trim().length > 0 ? true : 'This field is required'),
            when: () => !CLI_OPTIONS['giteaRepoOwner'] && !DEFAULT_GITEA_REPO_OWNER,
        },
        {
            type: 'input',
            name: 'giteaRepoName',
            message: 'Gitea repository name:',
            default: () => CLI_OPTIONS['giteaRepoName'] || DEFAULT_GITEA_REPO_NAME,
            validate: (value) => (String(value).trim().length > 0 ? true : 'This field is required'),
            when: () => !CLI_OPTIONS['giteaRepoName'] && !DEFAULT_GITEA_REPO_NAME,
        },
        {
            type: 'input',
            name: 'ref',
            message: (answers) => {
                const refType = answers.refType || CLI_OPTIONS['refType'];
                return `The name of the OpenAPI repository ${refType}`;
            },
            default: (answers) => {
                if (CLI_OPTIONS['ref']) {
                    return CLI_OPTIONS['ref'];
                }

                const refType = answers.refType || CLI_OPTIONS['refType'];

                switch (refType) {
                    case 'tag':
                        return 'schema-v1.0.0';
                    case 'commit':
                        return 'commit hash';
                    case 'branch':
                    default:
                        return 'master';
                }
            },
            when: !CLI_OPTIONS['ref'],
        },
        {
            type: 'confirm',
            name: 'multiFile',
            message: 'Should bundle a multi-file API definition into a single file?',
            when: !CLI_OPTIONS['multiFile'],
        },
        {
            type: 'list',
            name: 'openapiYamlRepoDir',
            message: 'Select directory in the repository with OpenAPI YAML file entrypoint:',
            choices: async (answers) => {
                const token = answers.token || CLI_OPTIONS['token'];
                const ref = answers.ref || CLI_OPTIONS['ref'];
                const giteaBaseDomain = answers.giteaBaseDomain || CLI_OPTIONS['giteaBaseDomain'] || DEFAULT_GITEA_BASE_DOMAIN;
                const giteaRepoOwner = answers.giteaRepoOwner || CLI_OPTIONS['giteaRepoOwner'] || DEFAULT_GITEA_REPO_OWNER;
                const giteaRepoName = answers.giteaRepoName || CLI_OPTIONS['giteaRepoName'] || DEFAULT_GITEA_REPO_NAME;

                try {
                    const giteaApi = new GiteaApi({
                        giteaBaseDomain,
                        repo: giteaRepoName,
                        owner: giteaRepoOwner,
                        token,
                        ref,
                    });
                    const directories = await giteaApi.getContents();
                    return directories.filter(({type}) => type === 'dir').map(({path}) => path);
                } catch (err) {
                    throw new Error(
                        `Error trying to load contents of the repository. Probably you made a mistake in the name of the ref "${ref}" or repository settings.`,
                    );
                }
            },
            when: !CLI_OPTIONS['openapiYamlRepoDir'],
        },
        {
            type: 'list',
            name: 'openapiTsOutputDir',
            message: 'Select output directory for generated TypeScript Schema:',
            choices: OUTPUT_DIRECTORIES,
            when: !CLI_OPTIONS['openapiTsOutputDir'],
        },
        {
            type: 'confirm',
            name: 'openapiYamlSave',
            message: 'Should save YAML spec after generating TypeScript file?',
            when: !CLI_OPTIONS['openapiYamlSave'],
            default: false,
        },
    ]);
}

async function createTempCopyOfMultiFileSpec(contents, giteaApi) {
    if (fs.existsSync(TEMP_MULTIFILE_SPECS_PATH)) {
        fs.rmSync(TEMP_MULTIFILE_SPECS_PATH, {
            recursive: true,
            force: true,
        });
    }

    fs.mkdirSync(TEMP_MULTIFILE_SPECS_PATH);

    for (const content of contents) {
        const outputPath = path.resolve(TEMP_MULTIFILE_SPECS_PATH, content.path);

        if (content.type === 'dir') {
            fs.mkdirSync(outputPath);
        }

        if (content.type === 'file') {
            const fileContent = await giteaApi.getFileRawContent(content.path);

            if (!fs.existsSync(path.dirname(outputPath))) {
                fs.mkdirSync(path.dirname(outputPath), {recursive: true});
            }

            fs.writeFileSync(outputPath, fileContent);
        }
    }
}

function deleteTempCopyOfMultiFileSpec() {
    fs.rmSync(TEMP_MULTIFILE_SPECS_PATH, {
        recursive: true,
        force: true,
    });
}

function saveOpenapiYamlContentsToFile(content, pathToFile) {
    fs.writeFileSync(pathToFile, content);
}

function generateOpenapiTsFile({outputYamlFile, outputTsFile, prependMeta}) {
    execSync(`npx openapi-typescript@5.*.* ${outputYamlFile} --output ${outputTsFile}`);

    // Prepend meta info in generated file
    const data = fs.readFileSync(outputTsFile);
    const fd = fs.openSync(outputTsFile, 'w+');
    const meta = Buffer.from(prependMeta + '\n');

    fs.writeSync(fd, meta, 0, meta.length, 0);
    fs.writeSync(fd, data, 0, data.length, meta.length);
    fs.close(fd, (err) => {
        if (err) throw err;
    });
}

function deleteOpenapiYamlTempFile(outputYamlFile) {
    fs.unlinkSync(outputYamlFile);
}

function formatOpenapiTsFile(outputTsFile) {
    execSync(`npx prettier ${outputTsFile} --write`);
}

(async function main() {
    try {
        const answers = await inquire();

        const token = answers.token || CLI_OPTIONS['token'];
        const refType = answers.refType || CLI_OPTIONS['refType'];
        const ref = answers.ref || CLI_OPTIONS['ref'];
        const giteaBaseDomain = answers.giteaBaseDomain || CLI_OPTIONS['giteaBaseDomain'] || DEFAULT_GITEA_BASE_DOMAIN;
        const giteaRepoOwner = answers.giteaRepoOwner || CLI_OPTIONS['giteaRepoOwner'] || DEFAULT_GITEA_REPO_OWNER;
        const giteaRepoName = answers.giteaRepoName || CLI_OPTIONS['giteaRepoName'] || DEFAULT_GITEA_REPO_NAME;
        const openapiYamlRepoDir = answers.openapiYamlRepoDir || CLI_OPTIONS['openapiYamlRepoDir'];
        const openapiYamlRepoFilename = answers.openapiYamlRepoFilename || CLI_OPTIONS['openapiYamlRepoFilename'];
        const openapiTsOutputDir = answers.openapiTsOutputDir || CLI_OPTIONS['openapiTsOutputDir'];
        const openapiYamlSave = answers.openapiYamlSave || CLI_OPTIONS['openapiYamlSave'];
        const multiFile = answers.multiFile || CLI_OPTIONS['multiFile'];

        const outputYamlFile = path.resolve(
            import.meta.dirname,
            `../src/${openapiTsOutputDir}/${OUTPUT_YAML_FILENAME}`,
        );
        const outputTsFile = path.resolve(import.meta.dirname, `../src/${openapiTsOutputDir}/${OUTPUT_TS_FILENAME}`);

        const prependMeta = `
        /* eslint-disable */

        /**
         * OpenAPI Schema reference: https://${giteaBaseDomain}/${giteaRepoOwner}/${giteaRepoName}/src/${refType}/${ref}/${openapiYamlRepoDir}/${openapiYamlRepoFilename}
         * OpenAPI Schema version: [${refType}] ${ref}
         * Generated at: ${new Date(Date.now()).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        })}
        */
        `;

        const giteaApi = new GiteaApi({
            giteaBaseDomain,
            repo: giteaRepoName,
            owner: giteaRepoOwner,
            token,
            ref,
        });

        if (multiFile) {
            console.info(
                `Recursively fetching OpenAPI documents from repository ${GITEA_REPO_OWNER}/${GITEA_REPO_NAME}...`,
            );
            const contents = await giteaApi.getDirContentsRecursively(openapiYamlRepoDir);

            console.info(`Creating temporary local copy of multi-file spec...`);
            await createTempCopyOfMultiFileSpec(contents, giteaApi);

            console.info(`Bundling multi-file spec into single YAML file...`);
            openapiBundler({
                specDirPath: path.resolve(TEMP_MULTIFILE_SPECS_PATH, openapiYamlRepoDir),
                specEntrypointFilename: openapiYamlRepoFilename,
                outputFilename: outputYamlFile,
            });

            console.info('Converting OpenAPI Schema to TypeScript file...');
            generateOpenapiTsFile({
                outputYamlFile,
                outputTsFile,
                prependMeta,
            });

            console.info(`Deleting temporary local copy of multi-file spec...`);
            deleteTempCopyOfMultiFileSpec();
        } else {
            console.info(`Fetching OpenAPI spec from repository ${GITEA_REPO_OWNER}/${GITEA_REPO_NAME}...`);
            const openapiYamlContent = await giteaApi.getFileRawContent(
                `${openapiYamlRepoDir}/${openapiYamlRepoFilename}`,
            );

            console.info(`Saving spec into file...`);
            saveOpenapiYamlContentsToFile(openapiYamlContent, outputYamlFile);

            console.info('Converting OpenAPI Schema to TypeScript file...');
            generateOpenapiTsFile({
                outputYamlFile,
                outputTsFile,
                prependMeta,
            });
        }

        console.info('Formatting generated TypeScript file with Prettier...');
        formatOpenapiTsFile(outputTsFile);

        if (!openapiYamlSave) {
            console.info('Deleting temporary OpenAPI YAML file...');
            deleteOpenapiYamlTempFile(outputYamlFile);
        }

        console.info(`File "${outputTsFile}" has been generated.`);
    } catch (err) {
        console.error(`Oops, something went wrong. Reason: ${err.message}`);
    }
})();
