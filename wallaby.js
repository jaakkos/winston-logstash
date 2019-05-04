module.exports = function (wallaby) {
    return {
        files: [
            'lib/**/*',
            'test/support/**/*',
            'test/mocha.opts',
        ],
        tests: [
            'test/**/*_test.js?(x)'

        ],
        env: {
            type: 'node',
            runner: 'node'
        },
        setup: function (w) {
            var mocha = w.testFramework;
            mocha.timeout(30000);
            mocha.reporter('spec');
        },
        testFramework: 'mocha'
    };
};
