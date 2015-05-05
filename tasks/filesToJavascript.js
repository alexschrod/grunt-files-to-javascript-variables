/*
 * grunt-files-to-javascript-variables
 * https://github.com/nikolayhg/grunt-files-to-javascript-variables
 *
 * Copyright (c) 2013 Nikolay Georgiev
 * Licensed under the MIT license.
 */
'use strict';

var mime = require('mime');

/**
 * A task that appends all files in a given folder to JavaScript variables.
 * Every file name has a format containing the property name of the Javascript variable.
 *
 * INPUTS:
 * <inputFilesFolder>**(<inputFilePrefix>)(indexString)property.<inputFileExtension>
 * (required)            (def: '')                              (def: any extension)
 *
 * <useFileName> : boolean/string (def: false)
 *
 * if useFileName===true
 * then the variable name will be the absolute path of the file
 *
 * if useFileName===string
 * then the variable name will be the absolute path of the file, without the value of useFileName 
 * A useFileName value of '../public_html/' will change an absolute path of '../public_html/img/photo.jpg' to 'img/photo.jpg'
 *
 * <useIndexes> : boolean (def: false)
 * <variableIndexMap> : indexString->index (def: undefined)
 *
 * if useIndexes===true and variableIndexMap===undefined
 * then etc the variableIndexMap is { '00' : 0, '01' : 1, '02' : 2, ... }
 *
 * OUTPUTS:
 * <outputBaseFile> : string (required)
 * <outputBaseFileVariable> : string (required)
 * <outputBaseFileVariableSuffix> : string (optional)
 *
 * <outputFile> : string (required) - this file will be overwritten every time the task is run!
 *    outputBaseFile
 *    outputBaseFileVariable.property or outputBaseFileVariable[index].property
 *
 * @param task - the grunt task
 * @param grunt - grunt itself
 * @constructor
 */
function FilesToJavascriptTask(task, grunt) {
    this.origTask = task;
    this.grunt = grunt;
    this.options = task.options(FilesToJavascriptTask.Defaults);
}

FilesToJavascriptTask.taskName = 'filesToJavascript';
FilesToJavascriptTask.taskDescription = 'Appends file contents to Javascript variables.';

FilesToJavascriptTask.Defaults = {
    inputFilePrefix: '',
    inputFileExtension: '',
    useIndexes: false,
    useFileName: false,
    shouldMinify: false,
    shouldBase64: false
};

var commentJson = require('comment-json');

FilesToJavascriptTask.prototype = {

    base64Encode: function(abspath,buffer) {
        var ret = 'data:';
        ret += mime.lookup(abspath);
        ret += ';base64,';
        ret += buffer.toString('base64');
        return ret;
    },

    run : function () {

        this.checkOptions();
        var grunt = this.grunt;
        var options = this.options;
        var base64Encode = this.base64Encode;

        // this string will contain all file contents and will be written in the output file at the end.
        var outputFileString = '';

        grunt.file.recurse(options.inputFilesFolder, function (abspath, rootdir, subdir, filename) {

            var prefixDefined = options.inputFilePrefix.length > 0;
            var fileNameStartsWithPrefix = options.inputFilePrefix.length > 0 &&
                                            filename.startsWith(options.inputFilePrefix);

            if ( prefixDefined && !fileNameStartsWithPrefix ) {
              return false;
            }

            if ( options.inputFileExtension.length > 0 ) {
              if ( Array.isArray(options.inputFileExtension) ) {
                var i = options.inputFileExtension.length,
                    hasExtension = false;
                while (i--) {
                  if ( filename.endsWith(options.inputFileExtension[i]) ) {
                    hasExtension = true;
                    break;
                  }
                }
                if ( !hasExtension ) { return false; }
              } else if ( !filename.endsWith(options.inputFileExtension) ) {
                return false;
              }
            }

            grunt.log.debug('File : ' + abspath);

            // (<inputFilePrefix>-)(indexString-)property.<inputFileExtension>
            var fileNameWithoutPrefix = filename;
            if (options.inputFilePrefix.length > 1) {
                fileNameWithoutPrefix = filename.substr(options.inputFilePrefix.length, filename.length);
            }

            var variableIndex = null;
            var fileNameWithoutIndexString = fileNameWithoutPrefix;
            var fileNamePropertyOnly = "";

            var shouldUseIndexes = options.useIndexes && options.variableIndexMap !== undefined;

            if (shouldUseIndexes) {
                var indexKeys = Object.keys(options.variableIndexMap);

                var numOfKeys = indexKeys.length;
                for (var keyIndex = 0; keyIndex < numOfKeys; keyIndex++) {
                    var currentKey = indexKeys[keyIndex];

                    if (fileNameWithoutPrefix.startsWith(currentKey)) {
                        variableIndex = options.variableIndexMap[currentKey];

                        fileNameWithoutIndexString = fileNameWithoutIndexString.substr(currentKey.length);
                        fileNamePropertyOnly = fileNameWithoutIndexString.substr(
                                                0, fileNameWithoutIndexString.lastIndexOf('.'));
                    }
                }

                if (variableIndex === null) {
                    grunt.fail.warn('No index string found in the options for the file' + abspath +
                       ' . Please add it to your options.');
                }

            } else if ( options.useFileName ) {
                shouldUseIndexes = true;
                variableIndex = '\'' + abspath.replace(options.useFileName,'') + '\'';
            } else {
                // if no index should be used, the the property matches the file name without the extension
                fileNamePropertyOnly = fileNameWithoutIndexString.substr(
                                      0, fileNameWithoutIndexString.lastIndexOf('.'));
            }

            // read the file
            var inputFileString;

            if (options.shouldBase64) {
                inputFileString = base64Encode(abspath,grunt.file.read(abspath,{ encoding: null }));
            } else {
                // remove the new lines and escape apostrophs '
                inputFileString = grunt.file.read(abspath).replace(/\n/g, '\\n');

                if (options.shouldMinify) {
                    var parsedJson = commentJson.parse(inputFileString);
                    inputFileString = commentJson.stringify(parsedJson);
                    parsedJson = null;
                }
            }

            var fullProperty = options.outputBaseFileVariable +
                (shouldUseIndexes? '[' + variableIndex + ']' : '' ) +
                (fileNamePropertyOnly.length > 0 ? '.' + fileNamePropertyOnly : '') +
                (options.outputBaseFileVariableSuffix? options.outputBaseFileVariableSuffix : '');

            grunt.log.debug('File contents added to: ' + fullProperty);

            if (options.inputFileExtension === 'json') {
              // leave the json contents, without quoting them.
            } else {
              // quote everything which is not json
              inputFileString = '\'' + inputFileString + '\'';
            }

            outputFileString += '\n' + fullProperty +
                ' = ' + inputFileString + ';\n';
        });

        var outputBaseFileString = grunt.file.read(options.outputBaseFile);
        grunt.file.write(options.outputFile, outputBaseFileString + outputFileString);
        grunt.log.writeln('File saved: ' + options.outputFile);
    },

    checkOptions : function () {
        var grunt = this.grunt;
        var options = this.options;

        if (options.inputFilesFolder === undefined) {
            grunt.fail.warn('Missing required option "inputFilesFolder"!');
        } else if (options.outputBaseFile === undefined) {
            grunt.fail.warn('Missing required option "outputBaseFile"!');

        } else if (options.outputBaseFileVariable === undefined) {
            grunt.fail.warn('Missing required option "outputBaseFileVariable"!');

        } else if (options.outputFile === undefined) {
            grunt.fail.warn('Missing required option "outputFile"!');
        }

        if (!grunt.file.exists(options.inputFilesFolder)) {
            grunt.fail.warn('The folder in the option "inputFilesFolder" ('+options.inputFilesFolder+') does not exist!');
        } else if (!grunt.file.exists(options.outputBaseFile)) {
            grunt.fail.warn('The file in the option "outputBaseFile" ('+options.outputBaseFile+') does not exist!');
        }
    }
};

module.exports = function (grunt) {
    grunt.registerMultiTask(
        FilesToJavascriptTask.taskName,
        FilesToJavascriptTask.taskDescription,
        function () {
            var task = new FilesToJavascriptTask(this, grunt);
            task.run();
        });
};

// Utils:
if (typeof String.prototype.startsWith !== 'function') {
    String.prototype.startsWith = function (str) {
        return this.slice(0, str.length) === str;
    };
}
if (typeof String.prototype.endsWith !== 'function') {
    String.prototype.endsWith = function (str) {
        return this.slice(this.length - str.length, this.length) === str;
    };
}
