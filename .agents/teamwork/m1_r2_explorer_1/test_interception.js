const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../../../server/node_modules/@prisma/client'));
const rawClient = new PrismaClient();

const ext = rawClient.$extends({
  name: 'TestExtension',
  query: {
    $allModels: {
      async findUnique({ model, args, query }) {
        console.log('Intercepted findUnique for model:', model, 'args:', args);
        const transformedArgs = {
          ...args,
          where: { ...(args.where || {}), complexId: 'cpx-test' }
        };
        // Delegate to findFirst on rawClient
        const modelDelegate = rawClient[model.charAt(0).toLowerCase() + model.slice(1)];
        if (!modelDelegate) {
          console.log('No delegate found for', model);
          return query(args);
        }
        console.log('Delegating to rawClient.' + model + '.findFirst with args:', JSON.stringify(transformedArgs));
        return modelDelegate.findFirst(transformedArgs);
      }
    }
  }
});

async function run() {
  try {
    console.log('Calling ext.unit.findUnique...');
    await ext.unit.findUnique({
      where: { id: '00000000-0000-0000-0000-000000000000' }
    });
  } catch (err) {
    console.log('Caught at top level:', err.name, '-->', err.message);
  } finally {
    await rawClient.$disconnect();
  }
}

run();
