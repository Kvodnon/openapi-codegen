import path from 'node:path';

export class RefLink {
    static refRegEx = /([\w\d\s./_-]+)?(#[\w\d\s./_\-~{}]+)?/;

    /**
     * @param path {string[]}
     */
    static toExternalPathname(path) {
        if (!Array.isArray(path)) {
            return '';
        }

        return path.join('/');
    }

    /**
     * @param pathname {string}
     */
    static toExternalPath(pathname) {
        if (typeof pathname !== 'string') {
            return [];
        }

        return pathname.split('/');
    }

    /**
     * @param path {string[]}
     */
    static toAnchorPathname(path) {
        if (!Array.isArray(path)) {
            return '';
        }

        const escapedPaths = path.map((segment) => {
            // Эскейпим специальные символы в строке
            // https://swagger.io/docs/specification/using-ref/
            return segment.replaceAll(/(~)|(\/)/gi, (match) => {
                switch (match) {
                    case '~':
                        return '~0';
                    case '/':
                        return '~1';
                    default:
                        return match;
                }
            });
        });

        return `#/${escapedPaths.join('/')}`;
    }

    /**
     * @param pathname {string}
     */
    static toAnchorPath(pathname) {
        if (typeof pathname !== 'string') {
            return [];
        }

        const path = pathname.split('/').map((segment) => {
            // Деэскейпим специальные символы в строке
            // https://swagger.io/docs/specification/using-ref/
            return segment.replaceAll(/(~0)|(~1)/gi, (match) => {
                switch (match) {
                    case '~0':
                        return '~';
                    case '~1':
                        return '/';
                    default:
                        return match;
                }
            });
        });

        if (path[0] === '#') {
            return path.slice(1);
        } else {
            return path;
        }
    }

    originalRef = '';
    externalPath = [];
    anchorPath = [];

    constructor(refStr) {
        if (typeof refStr !== 'string') {
            throw new TypeError('`$ref` has invalid type, it should be a string');
        }

        const parsedRef = refStr.match(RefLink.refRegEx);

        if (parsedRef === null) {
            throw new TypeError('`$ref` failed to parse. Probably it has invalid format.');
        }

        // const [pathname, externalPathname, anchorPathname]
        const [, externalPathname, anchorPathname] = parsedRef;

        this.originalRef = parsedRef.input;
        this.externalPath = RefLink.toExternalPath(externalPathname);
        this.anchorPath = RefLink.toAnchorPath(anchorPathname);
    }

    get externalPathname() {
        return RefLink.toExternalPathname(this.externalPath);
    }

    get externalPathFilename() {
        if (!this.isExternal) {
            return '';
        }

        return path.basename(this.externalPathname);
    }

    get externalPathDirname() {
        if (!this.isExternal) {
            return '';
        }

        return path.dirname(this.externalPathname);
    }

    get anchorPathname() {
        return RefLink.toAnchorPathname(this.anchorPath);
    }

    get isExternal() {
        return this.externalPath.length > 0;
    }

    get hasAnchor() {
        return this.anchorPath.length > 0;
    }

    /**
     * Устанавливает this.externalPath либо с помощью строки вида `path/to/ref`, либо с помощью массива вида `['path', 'to', 'ref']`
     * @param path {string[]|string}
     */
    setExternalPath(path) {
        if (Array.isArray(path)) {
            this.externalPath = path;
        } else if (typeof path === 'string') {
            this.externalPath = RefLink.toExternalPath(path);
        }

        return this;
    }

    /**
     * Устанавливает this.internalPath либо с помощью строки вида `#/path/to/ref`, либо с помощью массива вида `['path', 'to', 'ref']`
     * @param path {string[]|string}
     */
    setAnchorPath(path) {
        if (Array.isArray(path)) {
            this.anchorPath = path;
        } else if (typeof path === 'string') {
            this.anchorPath = RefLink.toAnchorPath(path);
        }

        return this;
    }

    hasExternalSegment(segment) {
        if (!this.isExternal) {
            return false;
        }

        return this.externalPath.includes(segment);
    }

    hasAnchorSegment(segment) {
        if (!this.hasAnchor) {
            return false;
        }

        return this.anchorPath.includes(segment);
    }

    toString() {
        return this.externalPathname + this.anchorPathname;
    }
}
