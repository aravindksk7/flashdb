import { getSqlClient } from './sqlClient';
import authService from './authService';
import logger from '../logger';

/**
 * Bootstrap RBAC system with default users and roles
 * Should be called on first startup
 */
export async function bootstrapRbac(): Promise<void> {
  try {
    const sqlClient = getSqlClient();

    // Check if admin user already exists
    const adminUserResult = await sqlClient.query(
      `SELECT user_id FROM dbo.flashdb_users WHERE username = 'admin'`
    );

    if (adminUserResult.recordset.length > 0) {
      logger.info('RBAC bootstrap: Admin user already exists, skipping bootstrap');
      return;
    }

    // Create default admin user
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin@FlashDB123!';
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@flashdb.local';

    logger.info('Creating default admin user...');
    const adminUserId = await authService.createUser('admin', adminEmail, adminPassword);

    // Get admin role
    const adminRoleResult = await sqlClient.query(
      `SELECT role_id FROM dbo.flashdb_roles WHERE role_name = 'admin'`
    );

    if (adminRoleResult.recordset.length > 0) {
      const adminRoleId = adminRoleResult.recordset[0].role_id;

      // Assign admin role to admin user
      await sqlClient.execute(`
        INSERT INTO dbo.flashdb_user_roles (user_id, role_id)
        VALUES ('${adminUserId}', '${adminRoleId}')
      `);

      logger.info(`Default admin user created successfully`);
      logger.info(`  Username: admin`);
      logger.info(`  Email: ${adminEmail}`);
      logger.info(`  IMPORTANT: Change the default password in production!`);
      logger.info(`  Password can be changed via: PUT /api/rbac/users/{userId}`);
    }

    // Create default operator user (optional)
    const createOperator = process.env.CREATE_DEFAULT_OPERATOR || 'false';
    if (createOperator === 'true') {
      const operatorPassword = process.env.DEFAULT_OPERATOR_PASSWORD || 'operator@FlashDB123!';
      const operatorEmail = process.env.DEFAULT_OPERATOR_EMAIL || 'operator@flashdb.local';

      logger.info('Creating default operator user...');
      const operatorUserId = await authService.createUser('operator', operatorEmail, operatorPassword);

      // Get operator role
      const operatorRoleResult = await sqlClient.query(
        `SELECT role_id FROM dbo.flashdb_roles WHERE role_name = 'operator'`
      );

      if (operatorRoleResult.recordset.length > 0) {
        const operatorRoleId = operatorRoleResult.recordset[0].role_id;

        await sqlClient.execute(`
          INSERT INTO dbo.flashdb_user_roles (user_id, role_id)
          VALUES ('${operatorUserId}', '${operatorRoleId}')
        `);

        logger.info(`Default operator user created successfully`);
      }
    }

    logger.info('RBAC bootstrap completed successfully');
  } catch (error: any) {
    logger.error(`Error bootstrapping RBAC: ${error.message}`);
    // Don't throw - bootstrap is optional
  }
}

export default {
  bootstrapRbac
};
