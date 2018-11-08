const { publishBehavior, filter, scan, tap } = require('rxjs/operators');

//------------------------------------------------------------------------------

module.exports = (main$) => {
    const subscription_state$ = main$.pipe(
        filter(message => message.type == 'SUB' || message.type == 'UNSUB'),
        scan((subscription_state, message) => {
            if (message.type == 'SUB')
            {
                subscription_state[message.id] = message.subscription;
            }
            else
            {
                delete subscription_state[message.id];
            }

            return subscription_state;
        }, {}),
        publishBehavior({})
    )

    subscription_state$.connect();

    return subscription_state$;
}