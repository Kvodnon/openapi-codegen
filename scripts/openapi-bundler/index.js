import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';
import recursiveReaddir from 'recursive-readdir-sync';
import traverse from 'traverse';

// eslint-disable-next-line import/no-useless-path-segments,import/extensions
import {convertToLocalComponentName, getRelativePath} from './utils/helpers.js';
// eslint-disable-next-line import/no-useless-path-segments,import/extensions
import {RefLink} from './utils/ref-link.js';

/**
 * Бандлер для сборки воедино нескольких файлов спецификации, ссылающихся друг на друга
 * @param specDirPath {string} - абсолютный путь к директории с файлами спецификации
 * @param specEntrypointFilename {string} - имя файла точки входа спецификации (напр.: `api.yml`)
 * @param outputFilename {string} - абсолютный путь к сбилженному файлу на выходе
 */
export function openapiBundler({specDirPath, specEntrypointFilename, outputFilename}) {
    // Обходим файлы в директории спеки с помощью recursive-readdir-sync
    const specPaths = recursiveReaddir(specDirPath);
    const specFiles = {};
    const componentsMap = new Map();

    // Конвертируем каждый yaml файл в объект вида (рефы в каждом объекте контента нормализуем и делаем для них абсолютный путь от корня):
    // {
    //   'path/to/file/1': { contents of file },
    //   'path/to/file/2': { contents of file },
    // }
    for (const specPath of specPaths) {
        const specContents = yaml.load(fs.readFileSync(specPath, 'utf8'));
        const specPathRelative = getRelativePath(specDirPath, specPath);

        traverse(specContents).forEach(function () {
            if (this.key === '$ref') {
                const ref = new RefLink(this.node);

                if (ref.isExternal) {
                    const refExternalAbsPathFromRoot = path.resolve(path.dirname(specPath), ref.externalPathname);
                    const refExternalRelPathFromRoot = getRelativePath(specDirPath, refExternalAbsPathFromRoot);
                    this.update(ref.setExternalPath(refExternalRelPathFromRoot).toString());
                } else {
                    this.update(ref.setExternalPath(specPathRelative).toString());
                }

                /**
                 * Если реф является компонентом, складываем его в отдельный мап с именованием ключей вида model_name_component_name.
                 * Например:
                 * common.yml#/components/schemas/response -> #/components/schemas/common_response
                 * crowd_projects.yml#/components/schemas/crowd_project -> #/components/schemas/crowd_projects_crowd_project
                 */
                if (ref.hasAnchorSegment('components')) {
                    // const [firstPathSegment, componentTypeSegment]
                    const [, componentTypeSegment] = ref.anchorPath;

                    componentsMap.set(convertToLocalComponentName(ref.toString()), {
                        type: componentTypeSegment,
                        ref: ref.toString(),
                    });
                }
            }
        });

        specFiles[specPathRelative] = specContents;
    }

    // Проверяем после обхода файлов в директории входит ли в него энтрипоинт
    if (!specFiles[specEntrypointFilename]) {
        throw new Error('Spec entrypoint file not found.');
    }

    // Подготавливаем объект компонентов (соответствующий структуре OpenAPI) для будущей вставки в энтрипоинт
    const components = {};

    for (const [componentName, {type, ref}] of componentsMap) {
        if (!components[type]) {
            components[type] = {};
        }
        const refLink = new RefLink(ref);
        const foundComponent = traverse(specFiles[refLink.externalPathname]).get(refLink.anchorPath);
        if (!foundComponent) continue;
        components[type][componentName] = foundComponent;
    }

    /**
     * Все внешние рефы внутри объекта компонентов связываем с внутренними компонентами с новыми именами вида model_name_component_name
     */
    traverse(components).forEach(function () {
        if (this.key === '$ref') {
            const componentName = convertToLocalComponentName(this.node);
            const {type} = componentsMap.get(componentName);
            this.update(`#/components/${type}/${componentName}`);
        }
    });

    /**
     * Подготавливаем массив для дереференса рефов, которые не являеются компонентами.
     * @type {{path: string[], content: object}[]}
     */
    const pathsToDereference = [];

    traverse(specFiles).forEach(function () {
        if (this.key === '$ref') {
            const ref = new RefLink(this.node);

            if (ref.isExternal) {
                // Если находим рефы на компоненты в спеке, переделываем путь на внутренние заранее подготовленные компоненты выше
                if (ref.hasAnchorSegment('components')) {
                    const componentName = convertToLocalComponentName(this.node);
                    const {type} = componentsMap.get(componentName);
                    this.update(`#/components/${type}/${componentName}`);
                } else {
                    // Если находим реф на не-компонент, складываем его в массив для дальнейшего дереференса
                    const dereferencedRef = traverse(specFiles[ref.externalPathname]).get(ref.anchorPath);

                    if (typeof dereferencedRef === 'object' && dereferencedRef !== null) {
                        pathsToDereference.push({
                            path: this.path.slice(0, this.path.length - 1),
                            content: dereferencedRef,
                        });
                    }
                }
            }
        }
    });

    // Проводим дереференс некомпонентных рефов
    for (const {path, content} of pathsToDereference) {
        traverse(specFiles).set(path, content);
    }

    // Собираем контент для вставки в смердженный файл
    const entrypointObject = specFiles[specEntrypointFilename];
    const mergedSpecObject = {
        ...entrypointObject,
        components,
    };

    if (typeof entrypointObject.components === 'object' && entrypointObject.components !== null) {
        mergedSpecObject.components = {
            ...entrypointObject.components,
            ...components,
        };
    }

    const mergedSpecYaml = yaml.dump(mergedSpecObject);

    // Пишем в файл
    fs.writeFileSync(outputFilename, mergedSpecYaml);
}
