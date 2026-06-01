opensdg.chartTypes.bar = function (info) {
    var config = opensdg.chartTypes.base(info);
    var overrides = {
        type: 'bar',
        borderWidth: 0,
    };
    if (info.stackedDisaggregation) {
        console.log('Stacked', info.stackedDisaggregation, typeof info.stackedDisaggregation);
        overrides.options = {
            scales: {
                x: { stacked: true },
                y: { stacked: true },
            }
        };
        // If we have stackedDisaggregation, we need to group datasets into stacks.
        config.data.datasets.forEach(function (dataset) {
            var disaggregation = $.extend({}, dataset.disaggregation);
            // We're going to "stringify" each combination of disaggregations in order
            // to place them in their own "stacks". To place "stacked" disaggregations
            // into the same stack, we set them as "samestack" before stringifying.
            // Note that the string "samestack" is completely arbitrary.
            if (typeof disaggregation[info.stackedDisaggregation] !== 'undefined') {
                disaggregation[info.stackedDisaggregation] = 'samestack';
            }
            // Use the disaggregation as a unique id for each stack.
            dataset.stack = JSON.stringify(disaggregation);
        });
    }

    if (info.graphStepsize && Object.keys(info.graphStepsize).length > 0) {
      overrides.options = {
          scales: {
            yAxes: [{
              ticks: {
                stepSize: info.graphStepsize.step,
              }
            }]
          }
      };
    }

    // Manually set the borderWidths to 0 to avoid a weird border effect on the bars.
    // exception for line datasets in a mixed chart
    config.data.datasets.forEach(function(dataset) {
      if (dataset.type == 'line') {
        dataset.borderWidth = 2;
      }
      else {
        dataset.borderWidth = 0;
      }
        //dataset.borderWidth = 0;
    });
    config.data.datasets.forEach(function(dataset) {
      if (dataset.type == 'line') {
        dataset.order = 0;
      }
      else {
        dataset.order = 1;
      }
    });
    // Add these overrides onto the normal config, and return it.
    _.merge(config, overrides);
    return config;
}
