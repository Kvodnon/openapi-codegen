import path from 'node:path';

// eslint-disable-next-line import/no-useless-path-segments,import/extensions
import {RefLink} from './ref-link.js';

export const getRelativePath = (rootAbsPath, absPath) => {
    return path.relative(rootAbsPath, absPath).replace(/\\/g, '/');
};

export const convertToLocalComponentName = (refStr) => {
    const ref = new RefLink(refStr);

    if (!ref.isExternal) {
        throw new TypeError(`Error transforming $ref. ${refStr} is not external.`);
    }

    const externalPathFilenameArr = ref.externalPathFilename.split('.');
    const externalNamespace = externalPathFilenameArr.slice(0, externalPathFilenameArr.length - 1);
    const anchorName = ref.anchorPath[ref.anchorPath.length - 1];

    return `${externalNamespace}_${anchorName}`;
};
