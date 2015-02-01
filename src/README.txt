================================================
Overview
================================================

This app provides a user-interface for editing lookup files in Splunk.



================================================
Known Limitations
================================================

1) The lookup editor is limited to editing files up to 10 MB. Files larger than this cannot be edited because it consume too much memory on some browsers.

2) The lookup editor does not enforce concurrency. This means that if two users edit a lookup file at the same time, someone will lose changes.



================================================
Getting Support
================================================

Go to the following website if you need support:

     http://answers.splunk.com/answers/app/1724

You can access the source-code and get technical details about the app at:

     https://github.com/LukeMurphey/lookup-editor



================================================
Change History
================================================

+---------+------------------------------------------------------------------------------------------------------------------+
| Version |  Changes                                                                                                         |
+---------+------------------------------------------------------------------------------------------------------------------+
| 0.5     | Initial release                                                                                                  |
|---------|------------------------------------------------------------------------------------------------------------------|
| 0.6     | Added support for Splunk 5.0                                                                                     |
|         | Added limit for large lookup files (>10 MB)                                                                      |
|         | Fixed issues where the modular input failed to validate parameters correctly and log error messages              |
|---------|------------------------------------------------------------------------------------------------------------------|
| 0.7     | Fixed issue where the header and footer did not show on 6.0 due to a Javascript error                            |
|---------|------------------------------------------------------------------------------------------------------------------|
| 1.0     | Fixed issue that prevented the app from working with custom root endpoints                                       |
|         | Updated the app to work better on Splunk 6.1                                                                     |
|---------|------------------------------------------------------------------------------------------------------------------|
| 1.1     | Added warning when users attempt to delete the header row                                                        |
|         | Made the header row sticky such that it stays at the top of the page even when you scroll down                   |
|---------|------------------------------------------------------------------------------------------------------------------|
| 1.2     | Added ability to select how many entries to show on each page                                                    |
|---------|------------------------------------------------------------------------------------------------------------------|
| 1.3     | Added built-in backups of files and ability to load the previous version                                         |
|---------|------------------------------------------------------------------------------------------------------------------|
| 1.3.1   | Updated icon for Splunk 6.2                                                                                      |
|---------|------------------------------------------------------------------------------------------------------------------|
| 1.4.0   | Added ability to import CSV files in the editor                                                                  |
|---------|------------------------------------------------------------------------------------------------------------------|
| 1.4.1   | Fixed issue where some lookup files could not be loaded in some cases                                            |
|         | Fixed minor Javascript error that occurred if the server indicated that the lookup file couldn't be saved        |
|         | Backup file times now represent the date that the file was modified (not the date it was backed up)              |
+---------+------------------------------------------------------------------------------------------------------------------+
