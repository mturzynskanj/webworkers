const { Observable } = require('rxjs');
const { publishBehavior, filter, map } = require('rxjs/operators');

//------------------------------------------------------------------------------

module.exports = (main$) => {
    const ladder_info$ = main$.pipe(
        filter(message => message.type == 'USER_TOKEN'),
        map(message => message.user_token),
        publishBehavior(null)
    )

    ladder_info$.connect();

    return ladder_info$;
}