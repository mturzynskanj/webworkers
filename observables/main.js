const { Subject } = require('rxjs');

const main$ = new Subject();
onmessage = (e) => main$.next(e.data);

module.exports = () => main$;
