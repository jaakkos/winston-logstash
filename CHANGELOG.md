# Changelog

## 1.1.0 (2022-11-16)

Features:

- Migrete to TypeScript

## 1.0.2 (2022-11-09)

Features:

- Update README.md

Bugfixes:

- Fix retry timeout which was removed on 1.x release.

## 1.0.0 (2022-11-02)

Features:

- Add support for winston 3.x

Bugfixes:

- Update development dependencies:
  - mocha 2.2.4 -> 10.1.0
  - chai 2.3.0 -> 4.3.6
  - timekeeper 0.0.5 -> 2.2.0
- change to Github Actions for running tests

## 0.4.0 (2017-11-24)

Features:

- <https://github.com/jaakkos/winston-logstash/pull/48>
- <https://github.com/jaakkos/winston-logstash/pull/46>

## 0.2.11 (2015-04-28)

Features:

- add support for close() method to allow for clean shutdown #27 (@kgoerlitz)
- add rejectUnauthorized in options #29 (@Akta3d)
- Added configurable support for timeout between connection retries. #25 (@KamalAman)

Bugfixes:

- Update development dependencies:
  - mocha 1.20.1 -> 2.2.4
  - chai 1.9.1 -> 2.3.0
  - timekeeper 0.0.4 -> 0.0.5
