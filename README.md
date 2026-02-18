# API Common Layer
Интерфейсы для запросов к различным эндпоинтам REST API. Использует Axios в качестве базовой библиотеки.

## Использование Openapi Codegen
Начиная с проекта логистики, документация REST API ведётся в формате [OpenAPI 3.0](https://swagger.io/specification/) в внешнем Gitea-репозитории (адрес и репозиторий настраиваются при запуске скрипта).

Контрибьютить в репозиторий могут фронтендеры и бэкендеры, добавляя новые роуты и исправляя ошибки в документации.

Для синхронизации документации и актуального кода на фронте используется автоматическая кодогенерация OpenAPI-схемы в TypeScript-интерфейсы.
Это делается с помощью скрипта `scripts/openapi-codegen.js`, который использует [openapi-typescript](https://www.npmjs.com/package/openapi-typescript).

### Принцип работы openapi-codegen скрипта
Скрипт работает в несколько шагов:
1) Делает запрос к указанному Gitea-репозиторию, с помощью [Gitea API](https://docs.gitea.io/en-us/api-usage/) вытягивая актуальную схему в формате YAML и временно сохраняя её в файл (при необходимости вытягивает все файлы из папки и бандлит их в один файл)
2) Конвертирует полученную схему из YAML-формата в TypeScript интерфейсы с помощью [openapi-typescript](https://www.npmjs.com/package/openapi-typescript)
3) Удаляет временный YAML-файл (при необходимости при помощи ключа `-ys` его можно оставить)
4) Форматирует сгенерированный TypeScript файл с помощью Prettier

### Создание Gitea API токена
Перед началом использования `openapi-codegen` нужно единожды сгенерировать личный Gitea API Token по [инструкции Gitea](https://docs.gitea.io/en-us/api-usage/#generating-and-listing-api-tokens) и сохранить его локально в надёжном месте (sha1 ключа отображается только один раз при создании).

### Использование openapi-codegen скрипта
Скрипт можно запустить напрямую: 
```shell
node scripts/openapi-codegen.js
```
или с помощью yarn:
```shell
yarn openapi-codegen
```

Запустится интерактивный CLI-интерфейс, в котором нужно указать необходимые данные для генерации кода (включая адрес Gitea, владельца и имя репозитория — или передать их через CLI/переменные окружения).
Если всё прошло успешно, сгенерируется TypeScript файл схемы в `packages/api/src/{openapiTsOutputDir}/openapi-schema.ts`.

Для файла `openapi-schema.ts` действует 3 главных правила:
1) Он хранится в репозитории, добавлять его в `.gitignore` не нужно
2) Его запрещено изменять напрямую, он всегда генерируется автоматически
3) Типы из схемы не использовать напрямую. Для удобства стоит перед этим определить их алиасы в соседнем `types.ts` файле, например:
```typescript
import {operations} from './openapi-schema';

export type GetAllCitiesRequest = operations['dictionaries_cities_get_all']['parameters']['query'];
export type GetAllCitiesResponse = operations['dictionaries_cities_get_all']['responses']['200']['content']['application/json'];
```


### CLI-опции
Чтобы не заполнять каждый раз поля повторно, их можно определить в CLI-аргументах или через переменные окружения при запуске скрипта.

#### Использование:
```shell
node scripts/openapi-codegen.js [OPTIONS]
```
или с помощью yarn:
```shell
yarn openapi-codegen -- [OPTIONS]
```

#### Пример:
```shell
yarn openapi-codegen -- --token=yourGiteaAPIToken --ref=v1.0.1 --gitea-base-domain=git.example.com --gitea-repo-owner=MyOrg --gitea-repo-name=openapi
```
Запустит скрипт с Gitea API токеном `yourGiteaAPIToken`, получит версию OpenAPI схемы с тегом `v1.0.1` и возьмёт спецификацию из указанного репозитория.

#### Список доступных аргументов можно посмотреть с помощью:
```shell
yarn openapi-codegen -- --help
```
