import axios from 'axios';

export class GiteaApi {
    giteaBaseDomain = '';
    repo = '';
    owner = '';
    ref = '';
    token = '';
    giteaApiBaseUrl = '';

    constructor({giteaBaseDomain, repo, owner, ref, token}) {
        this.giteaBaseDomain = giteaBaseDomain;
        this.repo = repo;
        this.owner = owner;
        this.ref = ref;
        this.token = token;
        this.giteaApiBaseUrl = `https://${this.giteaBaseDomain}/api/v1/repos/${this.owner}/${this.repo}`;
    }

    async request(method, path, params = {}) {
        const response = await axios.request({
            method,
            url: this.giteaApiBaseUrl + path,
            params: {
                ref: this.ref,
                token: this.token,
                ...params,
            },
        });
        return response.data;
    }

    async getFileRawContent(path) {
        return await this.request('get', `/raw/${path}`);
    }

    async getContents(path = '') {
        return await this.request('get', `/contents${path ? `/${path}` : ''}`);
    }

    async getDirContentsRecursively(path) {
        const collectedData = [];
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;

        async function getDirContents(path) {
            const directory = await self.getContents(path);

            if (!Array.isArray(directory)) {
                throw new Error(`Repo's path '${path}' is not a directory`);
            }

            for (const item of directory) {
                collectedData.push(item);
                if (item.type === 'dir') {
                    await getDirContents(item.path);
                }
            }
        }

        await getDirContents(path);

        return collectedData;
    }
}
