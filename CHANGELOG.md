# Change Log

All notable changes to the AMPL official plugin for VS code are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.2.1] - 20250728

### Added
- Features to statically add a list of files to parse (see features `AMPL: Select files to parse` and `AMPL: Select launch configuration` and )
- Parser can now follow includes, if they can be found in the directory containing the file that does include them
- Hovering over known AMPL options now gives a short description and a list of related options
- Go to definition now follows files in `include`, `model`, `commands` and `data` statements
- Workspace symbols (CTRL/Command+T) are now listed


### Fixed
- Syntax highlighting for all built-in functions
- Syntax highlighting for all built-in options
- Vastly increased parser coverage


## [0.1.2] - 20250615

### Changed

- Syntax highlight does not highlight keywords if parts of another word


## [0.0.7] - 2025-05-13

### Changed

- Language server now requires Java 11+
- Moved configuration items in `AMPL` to `AMPL.Runtime`

 

## [0.0.6] - 2025-05-12

### Added 

- Initial alpha release