## Unreleased (2024-11-21)

## v1.0.0 (2024-11-20)

### New feature

- export IParsedMessage and IParsedMedia types from the types module([`a14cbb4`](https://github.com/frierendv/frieren/commit/a14cbb41cc92332863fd1d1742f2e2d971afcb4b)) (by FrierenDv)
- create module type definition file and update import statement for baileys([`54cbb80`](https://github.com/frierendv/frieren/commit/54cbb800fff5fe9e4a965d4e5aad59ab1d6179d8)) (by FrierenDv)
- enhance WASocket initialization and message handling with new event processing and version fetching([`37dd4b9`](https://github.com/frierendv/frieren/commit/37dd4b930378077d2cfeef1ed78f85f0189a0b3e)) (by FrierenDv)
- add size property to IParsedMedia interface to support media size handling([`2bedaa7`](https://github.com/frierendv/frieren/commit/2bedaa7c4c93e5e271cc29e1e08e7065dae1e4fb)) (by FrierenDv)
- add calculateSize function to handle Long type sizes([`8567591`](https://github.com/frierendv/frieren/commit/85675915925972f7c8646eea76de163172281c39)) (by FrierenDv)
- add wrap function for error handling in asynchronous operations([`c3999f8`](https://github.com/frierendv/frieren/commit/c3999f8ece30b4e46d8c9a20ead8bbc834d0520b)) (by FrierenDv)
- add message property to IParsedMessageBase interface([`edd9ecc`](https://github.com/frierendv/frieren/commit/edd9ecc9685ce2a0416d6516b2b3cf290a6fe46f)) (by FrierenDv)
- implement Mutex class with task queue and interval execution([`d18e3f1`](https://github.com/frierendv/frieren/commit/d18e3f13d30cf04cc795efd70fe51c17993ea707)) (by FrierenDv)
- add async-mutex dependency to package.json and package-lock.json([`d16a24d`](https://github.com/frierendv/frieren/commit/d16a24d49e7d0c399eae88fd417cdfb24b7fb05c)) (by FrierenDv)
- update build and lint scripts for improved TypeScript handling([`74d77a1`](https://github.com/frierendv/frieren/commit/74d77a1cee181fd5889ffcbe95b09b297c13e2e6)) (by FrierenDv)
- refactor message handling and add phone number parsing utilities([`ae6ee37`](https://github.com/frierendv/frieren/commit/ae6ee376ab75e67c058e0ed66b84e17ce8992edb)) (by FrierenDv)
- enhance package.json with main entry, types, and exports configuration([`eb4c4d7`](https://github.com/frierendv/frieren/commit/eb4c4d7ef8a39cb3c01aa8a452489a96c5ed8d61)) (by FrierenDv)
- update CodeQL workflow([`d680b33`](https://github.com/frierendv/frieren/commit/d680b336bd3415579261222da525c0d20bf50023)) (by FrierenDv)

### Bugs fixed

- update import path for Client to reflect new API structure([`6ed22c0`](https://github.com/frierendv/frieren/commit/6ed22c0a1b1ef674ff6a128dacfe448e9e7c75e2)) (by FrierenDv)
