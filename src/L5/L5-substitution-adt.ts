import { curry, map, prop } from 'ramda';
import { eqTVar, isAtomicTExp, isProcTExp, isTVar, makeProcTExp, unparseTExp, TExp, TVar } from "./TExp";
import { isEmpty, first, rest } from "../shared/list";
import { Result, makeOk, makeFailure, mapResult, bind } from '../shared/result';

// Implementation of the Substitution ADT
// ========================================================
// A substitution is represented as a 2 element list of equal length
// lists of variables and type expression.
// The empty substitution is [[], []]

export interface Sub {tag: "Sub"; vars: TVar[]; tes: TExp[]; };
export const isSub = (x: any): x is Sub => x.tag === "Sub";

// Constructors:
// Signature: makeSub(vars, tes)
// Purpose: Create a substitution in which the i-th element of 'variables'
//          is mapped to the i-th element of 'tes'.
// Example: makeSub(
//             map(parseTE, ["x", "y", "z"]),
//             map(parseTE, ["number", "boolean", "(number -> number)"])
//          => {tag: "Sub", vars: [x y z], [numTexp, boolTexp, ProcTexp([NumTexp, NumTexp])]}
//          makeSub(map(parseTE, ["x", "y", "z"]),
//                  map(parseTE, ["number", "boolean", "(z -> number)"]))
//          => error makeSub: circular substitution
// Pre-condition: (length variables) = (length tes)
//                variables has no repetitions (set)
export const makeSub = (vars: TVar[], tes: TExp[]): Result<Sub> =>
    bind(checkNoOccurrences(vars, tes), _ => makeOk({ tag: "Sub", vars: vars, tes: tes }));

export const makeEmptySub = (): Sub => ({tag: "Sub", vars: [], tes: []});

// Purpose: when attempting to bind tvar to te in a sub - check whether tvar occurs in te.
// Return error if a circular reference is found.
export const checkNoOccurrence = (tvar: TVar, te: TExp): Result<true> => {
    const check = (e: TExp): Result<true> =>
        isTVar(e) ? ((e.var === tvar.var) ? makeFailure(`Occur check error - circular sub ${tvar.var} in ${unparseTExp(te)}`) : makeOk(true)) :
        isAtomicTExp(e) ? makeOk(true) :
        isProcTExp(e) ? bind(mapResult(check, e.paramTEs), _ => check(e.returnTE)) :
        makeFailure(`Bad type expression ${e} in ${te}`);
    return check(te);
};

// Purpose: Perform a sequence of "checkNoOccurrence", return Ok<true> if successful,
//          or the first Failure in case of an error.
const checkNoOccurrences = (vars: TVar[], tes: TExp[]): Result<true> =>
    vars.length === 0 ? makeOk(true) :
    bind(checkNoOccurrence(vars[0], tes[0]), _ => checkNoOccurrences(vars.slice(1), tes.slice(1)));

export const isEmptySub = (sub: any): boolean => isSub(sub) && isEmpty(sub.vars) && isEmpty(sub.tes);

// Purpose: If v is in sub.vars - return corresponding te, else v unchanged.
export const subGet = (sub: Sub, v: TVar): TExp => {
    const lookup = (vars: TVar[], tes: TExp[]): TExp =>
        isEmpty(vars) ? v :
        eqTVar(first(vars), v) ? first(tes) :
        lookup(rest(vars), rest(tes));
    return lookup(sub.vars, sub.tes);
};

// ============================================================
// Purpose: apply a sub to a TExp
// Example:
// unparseTexp(applySub(makeSub(map(parseTE, ["T1", "T2"]), map(parseTE, ["number", "boolean"])),
//                      parseTE("(T1 * T2 -> T1)")) =>
// "(number * boolean -> number)"
export const applySub = (sub: Sub, te: TExp): TExp =>
    isEmptySub(sub) ? te :
    isAtomicTExp(te) ? te :
    isTVar(te) ? subGet(sub, te) :
    isProcTExp(te) ? makeProcTExp(map(curry(applySub)(sub), te.paramTEs), applySub(sub, te.returnTE)) :
    te;

// ============================================================
// Purpose: Returns the composition of substitutions s.t.:
//  applySub(result, te) === applySub(sub2, applySub(sub1, te))
export const combineSub = (sub1: Sub, sub2: Sub): Result<Sub> =>
    isEmptySub(sub1) ? makeOk(sub2) :
    isEmptySub(sub2) ? makeOk(sub1) :
    combine(sub1, sub2.vars, sub2.tes);

const combine = (sub: Sub, vars: TVar[], tes: TExp[]): Result<Sub> =>
    isEmpty(vars) ? makeOk(sub) :
    bind(extendSub(sub, first(vars), first(tes)), (extSub: Sub) => combine(extSub, rest(vars), rest(tes)));

// Purpose: extend a substitution with one pair (tv, te)
// Calls to makeSub to do the occur-check
export const extendSub = (sub: Sub, v: TVar, te: TExp): Result<Sub> =>
    bind(makeSub([v], [te]), (sub2: Sub) => {
        const updatedTEs = map(curry(applySub)(sub2), sub.tes);
        return map(prop('var'), sub.vars).includes(v.var)
               ? makeSub(sub.vars, updatedTEs)
               : makeSub([v].concat(sub.vars), [te].concat(updatedTEs));
    });
