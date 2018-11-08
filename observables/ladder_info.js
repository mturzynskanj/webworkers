const { Observable } = require('rxjs');
const { publishBehavior, filter, map } = require('rxjs/operators');

//------------------------------------------------------------------------------

module.exports = (main$) => {
    const ladder_info$ = main$.pipe(
        filter(message => message.type == 'LADDER_INFO'),
        map(message => message.ladder_info),
        publishBehavior(null)
    )

    ladder_info$.connect();

    return ladder_info$;
}