# Dependency sets shared by prepare-deps.sh and deps.sh. One line per set: <name> <npm packages...>
ZAILEYS_VERSION="${EVAL_ZAILEYS_VERSION:-4.15.1}"
DEP_SETS="
base zaileys@$ZAILEYS_VERSION typescript@5 @types/node@22
express zaileys@$ZAILEYS_VERSION typescript@5 @types/node@22 express@5 @types/express@5
"
