import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

interface SeedUser {
    username: string;
    password: string;
    email: string;
    display_name: string;
    isAdmin: boolean;
}

const SEED_USERS: SeedUser[] = [
    {
        username: 'gamemaster',
        password: 'gamemaster',
        email: 'gm@gm.not',
        display_name: 'Game Master',
        isAdmin: true
    },
    {
        username: 'bob',
        password: 'bob',
        email: 'bob@transcendence.local',
        display_name: 'Bob',
        isAdmin: true
    },
    {
        username: 'adam',
        password: 'adam',
        email: 'adam@transcendence.local',
        display_name: 'Adam',
        isAdmin: false
    },
    {
        username: 'eve',
        password: 'eve',
        email: 'eve@transcendence.local',
        display_name: 'Eve',
        isAdmin: false
    }
];

export async function seedDatabase(fastify: FastifyInstance): Promise<void> {
    fastify.log.info('Checking if database needs seeding...');

    try {
        // Check if any users exist
        const userCount = await new Promise<number>((resolve, reject) => {
            fastify.sqlite.get(
                'SELECT COUNT(*) as count FROM users',
                (err: Error | null, row: any) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });

        if (userCount > 0) {
            fastify.log.info(`Database already has ${userCount} user(s), skipping seed`);
            return;
        }

        fastify.log.info('Seeding database with default users...');

        for (const user of SEED_USERS) {
            // Hash password
            const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);

            // Insert user
            const userId = await new Promise<number>((resolve, reject) => {
                fastify.sqlite.run(
                    'INSERT INTO users (username, password, email, display_name) VALUES (?, ?, ?, ?)',
                    [user.username, hashedPassword, user.email, user.display_name],
                    function (err: Error | null) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });

            fastify.log.info(`Created user: ${user.username} (ID: ${userId})`);

            // Add admin role if needed
            if (user.isAdmin) {
                await new Promise<void>((resolve, reject) => {
                    fastify.sqlite.run(
                        'INSERT INTO admins (user_id) VALUES (?)',
                        [userId],
                        (err: Error | null) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                fastify.log.info(`Granted admin privileges to: ${user.username}`);
            }
        }

        fastify.log.info('Database seeding completed successfully');
    } catch (err) {
        fastify.log.error(`Error seeding database: ${err}`);
        throw err;
    }
}
