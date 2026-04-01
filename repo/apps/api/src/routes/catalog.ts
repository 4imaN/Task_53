import { mkdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { sha256Buffer, sha256File } from '../utils/checksum.js';
import { AccessControlService } from '../services/access-control.service.js';
import type { AuthenticatedUser } from '../types/fastify.js';

const itemParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['itemId'],
  properties: {
    itemId: { type: 'string', format: 'uuid' }
  }
} as const;

const reviewParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reviewId'],
  properties: {
    reviewId: { type: 'string', format: 'uuid' }
  }
} as const;

const questionParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['questionId'],
  properties: {
    questionId: { type: 'string', format: 'uuid' }
  }
} as const;

const imageParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['imageId'],
  properties: {
    imageId: { type: 'string', format: 'uuid' }
  }
} as const;

const favoriteBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    favorite: { type: 'boolean' }
  }
} as const;

const reviewBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rating', 'body'],
  properties: {
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    body: { type: 'string', minLength: 1, maxLength: 5000 }
  }
} as const;

const followupBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: {
    body: { type: 'string', minLength: 1, maxLength: 5000 },
    ratingOverride: { type: 'integer', minimum: 1, maximum: 5 }
  }
} as const;

const questionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['question'],
  properties: {
    question: { type: 'string', minLength: 3, maxLength: 2000 }
  }
} as const;

const answerBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: {
    body: { type: 'string', minLength: 1, maxLength: 5000 }
  }
} as const;

const patchItemBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', maxLength: 4000 },
    unitOfMeasure: { type: 'string', minLength: 1, maxLength: 64 },
    temperatureBand: { type: 'string', minLength: 1, maxLength: 64 },
    weightLbs: { type: 'number', minimum: 0 },
    lengthIn: { type: 'number', minimum: 0 },
    widthIn: { type: 'number', minimum: 0 },
    heightIn: { type: 'number', minimum: 0 }
  }
} as const;

const imageQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    download: { type: 'string', enum: ['true', 'false', '1', '0'] }
  }
} as const;

const updateItemRating = async (fastify: FastifyInstance, itemId: string) => {
  await fastify.db.query(
    `
      UPDATE items
      SET average_rating = COALESCE(ratings.average_rating, 0),
          rating_count = COALESCE(ratings.rating_count, 0),
          updated_at = NOW()
      FROM (
        SELECT item_id, AVG(rating)::numeric(3, 2) AS average_rating, COUNT(*)::integer AS rating_count
        FROM reviews
        WHERE item_id = $1
        GROUP BY item_id
      ) ratings
      WHERE items.id = $1
    `,
    [itemId]
  );

  await fastify.db.query(
    `
      UPDATE items
      SET average_rating = 0,
          rating_count = 0,
          updated_at = NOW()
      WHERE id = $1
        AND NOT EXISTS (SELECT 1 FROM reviews WHERE item_id = $1)
    `,
    [itemId]
  );
};

const trimHistory = async (fastify: FastifyInstance, userId: string) => {
  await fastify.db.query(
    `
      DELETE FROM browsing_history
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id
          FROM browsing_history
          WHERE user_id = $1
          ORDER BY viewed_at DESC
          LIMIT 1000
        )
    `,
    [userId]
  );
};

export const registerCatalogRoutes = async (fastify: FastifyInstance) => {
  const accessControl = new AccessControlService(fastify);
  const resolveDepartmentFilter = async (user: AuthenticatedUser, columnRef = 'i.department_id') => {
    const allowedDepartmentIds = await accessControl.getAllowedDepartmentIds(user);
    if (allowedDepartmentIds === null) {
      return { sql: '', values: [] as unknown[] };
    }

    if (!allowedDepartmentIds.length) {
      return { sql: ' AND 1 = 0', values: [] as unknown[] };
    }

    return { sql: ` AND ${columnRef} = ANY($1::uuid[])`, values: [allowedDepartmentIds] as unknown[] };
  };

  fastify.post('/catalog/reviews/:reviewId/images', {
    preHandler: fastify.authenticate,
    schema: { params: reviewParamsSchema }
  }, async (request, reply) => {
    const { reviewId } = request.params as { reviewId: string };
    await accessControl.ensureReviewAccess(request.authUser!, reviewId);
    const reviewResult = await fastify.db.query<{ user_id: string }>(
      `SELECT user_id FROM reviews WHERE id = $1`,
      [reviewId]
    );

    if (!reviewResult.rowCount) {
      return reply.code(404).send({ message: 'Review not found' });
    }

    if (reviewResult.rows[0].user_id !== request.authUser!.id) {
      return reply.code(403).send({ message: 'Only the review author can attach images' });
    }

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ message: 'Image file is required' });
    }

    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedMimeTypes.has(file.mimetype)) {
      return reply.code(422).send({ message: 'Unsupported image format' });
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return reply.code(422).send({ message: 'Image exceeds 10 MB limit' });
    }

    const extension = file.filename.includes('.') ? file.filename.split('.').pop() : 'bin';
    const storageDir = path.join(
      config.uploadRoot,
      'review-images',
      new Date().toISOString().slice(0, 10)
    );
    await mkdir(storageDir, { recursive: true });

    const filename = `${randomUUID()}.${extension}`;
    const filePath = path.join(storageDir, filename);
    await writeFile(filePath, buffer);

    const checksum = sha256Buffer(buffer);
    const imageResult = await fastify.db.query<{ id: string }>(
      `
        INSERT INTO review_images (review_id, file_path, checksum_sha256, mime_type, file_size_bytes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [reviewId, filePath, checksum, file.mimetype, buffer.byteLength]
    );

    request.auditContext = {
      actionType: 'review_image_upload',
      resourceType: 'review',
      resourceId: reviewId,
      details: { imageId: imageResult.rows[0].id, mimeType: file.mimetype, fileSizeBytes: buffer.byteLength }
    };

    return reply.code(201).send({ imageId: imageResult.rows[0].id });
  });

  fastify.get('/catalog/review-images/:imageId/content', {
    preHandler: fastify.authenticate,
    schema: {
      params: imageParamsSchema,
      querystring: imageQuerySchema
    }
  }, async (request, reply) => {
    const { imageId } = request.params as { imageId: string };
    const { download } = request.query as { download?: string };
    await accessControl.ensureReviewImageAccess(request.authUser!, imageId);
    const imageResult = await fastify.db.query<{
      file_path: string;
      checksum_sha256: string;
      mime_type: string;
      review_id: string;
    }>(
      `
        SELECT file_path, checksum_sha256, mime_type, review_id
        FROM review_images
        WHERE id = $1
      `,
      [imageId]
    );

    if (!imageResult.rowCount) {
      return reply.code(404).send({ message: 'Image not found' });
    }

    const image = imageResult.rows[0];
    if (download === 'true' || download === '1') {
      if (!request.authUser!.permissionCodes.includes('images.export')) {
        return reply.code(403).send({ message: 'Image export is not permitted for this account' });
      }

      // Streamed responses can race hook-based audit assertions in tests; write immediately for export events.
      await fastify.writeAudit({
        userId: request.authUser?.id ?? null,
        actionType: 'image_export',
        resourceType: 'review_image',
        resourceId: imageId,
        details: {
          reviewId: image.review_id,
          mimeType: image.mime_type,
          download: true
        },
        ipAddress: request.ip
      });
      reply.header('content-disposition', `attachment; filename="${imageId}"`);
    } else {
      reply.header('content-disposition', 'inline');
    }

    const computedChecksum = await sha256File(image.file_path);
    if (computedChecksum !== image.checksum_sha256) {
      await fastify.writeAudit({
        userId: request.authUser?.id ?? null,
        actionType: 'review_image_checksum_mismatch',
        resourceType: 'review_image',
        resourceId: imageId,
        details: {
          reviewId: image.review_id,
          download: download === 'true' || download === '1'
        },
        ipAddress: request.ip
      });
      return reply.code(409).send({ message: 'File integrity check failed' });
    }

    reply.type(image.mime_type);
    return reply.send(createReadStream(image.file_path));
  });

  fastify.get('/catalog/items', { preHandler: fastify.authenticate }, async (request) => {
    const departmentFilter = await resolveDepartmentFilter(request.authUser!);
    const result = await fastify.db.query(
      `
        SELECT id, sku, name, description, average_rating, rating_count, unit_of_measure, temperature_band
        FROM items i
        WHERE i.deleted_at IS NULL${departmentFilter.sql}
        ORDER BY name ASC
      `,
      departmentFilter.values
    );

    return result.rows;
  });

  fastify.get('/catalog/favorites', { preHandler: fastify.authenticate }, async (request) => {
    const allowedDepartmentIds = await accessControl.getAllowedDepartmentIds(request.authUser!);
    const result = await fastify.db.query(
      `
        SELECT i.id, i.sku, i.name, i.average_rating, i.rating_count, f.created_at
        FROM favorites f
        JOIN items i ON i.id = f.item_id
        WHERE f.user_id = $1
          AND ($2::uuid[] IS NULL OR i.department_id = ANY($2::uuid[]))
        ORDER BY f.created_at DESC
      `,
      [request.authUser!.id, allowedDepartmentIds]
    );

    return result.rows;
  });

  fastify.get('/catalog/history', { preHandler: fastify.authenticate }, async (request) => {
    const allowedDepartmentIds = await accessControl.getAllowedDepartmentIds(request.authUser!);
    const result = await fastify.db.query(
      `
        SELECT bh.id, bh.viewed_at, i.id AS item_id, i.sku, i.name
        FROM browsing_history bh
        JOIN items i ON i.id = bh.item_id
        WHERE bh.user_id = $1
          AND ($2::uuid[] IS NULL OR i.department_id = ANY($2::uuid[]))
        ORDER BY bh.viewed_at DESC
        LIMIT 20
      `,
      [request.authUser!.id, allowedDepartmentIds]
    );

    return result.rows;
  });

  fastify.post('/catalog/items/:itemId/favorite', {
    preHandler: fastify.authenticate,
    schema: {
      params: itemParamsSchema,
      body: favoriteBodySchema
    }
  }, async (request) => {
    const { itemId } = request.params as { itemId: string };
    const body = request.body as { favorite?: boolean };
    const favorite = body.favorite ?? true;
    await accessControl.ensureItemAccess(request.authUser!, itemId);

    if (favorite) {
      await fastify.db.query(
        `
          INSERT INTO favorites (user_id, item_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, item_id) DO NOTHING
        `,
        [request.authUser!.id, itemId]
      );
    } else {
      await fastify.db.query(
        `DELETE FROM favorites WHERE user_id = $1 AND item_id = $2`,
        [request.authUser!.id, itemId]
      );
    }

    request.auditContext = {
      actionType: favorite ? 'favorite_add' : 'favorite_remove',
      resourceType: 'item',
      resourceId: itemId
    };

    return { success: true, favorite };
  });

  fastify.post('/catalog/items/:itemId/reviews', {
    preHandler: fastify.authenticate,
    schema: {
      params: itemParamsSchema,
      body: reviewBodySchema
    }
  }, async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const body = request.body as { rating: number; body: string };
    await accessControl.ensureItemAccess(request.authUser!, itemId);

    const reviewResult = await fastify.db.query(
      `
        INSERT INTO reviews (item_id, user_id, rating, body)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (item_id, user_id)
        DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, edited_at = NOW()
        RETURNING id
      `,
      [itemId, request.authUser!.id, body.rating, body.body]
    );

    await updateItemRating(fastify, itemId);

    request.auditContext = {
      actionType: 'review_upsert',
      resourceType: 'item',
      resourceId: itemId,
      details: { reviewId: reviewResult.rows[0].id, rating: body.rating }
    };

    return reply.code(201).send({ reviewId: reviewResult.rows[0].id });
  });

  fastify.post('/catalog/reviews/:reviewId/followups', {
    preHandler: fastify.authenticate,
    schema: {
      params: reviewParamsSchema,
      body: followupBodySchema
    }
  }, async (request, reply) => {
    const { reviewId } = request.params as { reviewId: string };
    const body = request.body as { body: string; ratingOverride?: number };
    await accessControl.ensureReviewAccess(request.authUser!, reviewId);

    const reviewResult = await fastify.db.query<{ item_id: string; user_id: string }>(
      `
        SELECT item_id, user_id
        FROM reviews
        WHERE id = $1
      `,
      [reviewId]
    );

    if (!reviewResult.rowCount) {
      return reply.code(404).send({ message: 'Review not found' });
    }

    const review = reviewResult.rows[0];
    if (review.user_id !== request.authUser!.id) {
      return reply.code(403).send({ message: 'Follow-up reviews are limited to the original reviewer' });
    }

    await fastify.db.query(
      `
        INSERT INTO review_followups (parent_review_id, user_id, body, rating_override)
        VALUES ($1, $2, $3, $4)
      `,
      [reviewId, request.authUser!.id, body.body, body.ratingOverride ?? null]
    );

    if (body.ratingOverride) {
      await fastify.db.query(
        `UPDATE reviews SET rating = $2, edited_at = NOW() WHERE id = $1`,
        [reviewId, body.ratingOverride]
      );
      await updateItemRating(fastify, review.item_id);
    }

    request.auditContext = {
      actionType: 'review_followup_create',
      resourceType: 'review',
      resourceId: reviewId,
      details: { ratingOverride: body.ratingOverride ?? null }
    };

    return reply.code(201).send({ success: true });
  });

  fastify.post('/catalog/items/:itemId/questions', {
    preHandler: fastify.authenticate,
    schema: {
      params: itemParamsSchema,
      body: questionBodySchema
    }
  }, async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const body = request.body as { question: string };
    await accessControl.ensureItemAccess(request.authUser!, itemId);

    const result = await fastify.db.query<{ id: string }>(
      `
        INSERT INTO qa_threads (item_id, asked_by, question)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [itemId, request.authUser!.id, body.question]
    );

    request.auditContext = {
      actionType: 'qa_question_create',
      resourceType: 'item',
      resourceId: itemId,
      details: { questionId: result.rows[0].id }
    };

    return reply.code(201).send({ questionId: result.rows[0].id });
  });

  fastify.post('/catalog/questions/:questionId/answers', {
    preHandler: fastify.authenticate,
    schema: {
      params: questionParamsSchema,
      body: answerBodySchema
    }
  }, async (request, reply) => {
    const { questionId } = request.params as { questionId: string };
    const body = request.body as { body: string };
    accessControl.ensureCatalogAnswerAccess(request.authUser!);
    await accessControl.ensureQuestionAccess(request.authUser!, questionId);
    const isCatalogEditorAnswer = request.authUser!.roleCodes.includes('catalog_editor')
      || request.authUser!.roleCodes.includes('administrator');

    const result = await fastify.db.query<{ id: string }>(
      `
        INSERT INTO qa_answers (thread_id, answered_by, body, is_catalog_editor_answer)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [questionId, request.authUser!.id, body.body, isCatalogEditorAnswer]
    );

    request.auditContext = {
      actionType: 'qa_answer_create',
      resourceType: 'qa_thread',
      resourceId: questionId,
      details: { answerId: result.rows[0].id, isCatalogEditorAnswer }
    };

    return reply.code(201).send({ answerId: result.rows[0].id });
  });

  fastify.get('/catalog/items/:itemId', {
    preHandler: fastify.authenticate,
    schema: { params: itemParamsSchema }
  }, async (request) => {
    const { itemId } = request.params as { itemId: string };
    await accessControl.ensureItemAccess(request.authUser!, itemId);

    const itemResult = await fastify.db.query(
      `
        SELECT
          i.id,
          i.sku,
          i.name,
          i.description,
          i.average_rating,
          i.rating_count,
          i.unit_of_measure,
          i.temperature_band,
          EXISTS (
            SELECT 1 FROM favorites f WHERE f.item_id = i.id AND f.user_id = $2
          ) AS is_favorited
        FROM items i
        WHERE i.id = $1 AND i.deleted_at IS NULL
      `,
      [itemId, request.authUser!.id]
    );

    if (!itemResult.rowCount) {
      return { item: null, reviews: [], questions: [], favorites: [], history: [] };
    }

    await fastify.db.query(
      `
        INSERT INTO browsing_history (user_id, item_id)
        VALUES ($1, $2)
      `,
      [request.authUser!.id, itemId]
    );
    await trimHistory(fastify, request.authUser!.id);

    const reviewResult = await fastify.db.query(
      `
        SELECT
          r.id,
          r.rating,
          r.body,
          r.created_at,
          r.edited_at,
          u.display_name AS author,
          COALESCE((
            SELECT json_agg(
              json_build_object(
                'id', rf.id,
                'body', rf.body,
                'created_at', rf.created_at,
                'rating_override', rf.rating_override
              )
              ORDER BY rf.created_at
            )
            FROM review_followups rf
            WHERE rf.parent_review_id = r.id
          ), '[]'::json) AS followups,
          COALESCE((
            SELECT json_agg(
              json_build_object(
                'id', ri.id,
                'mime_type', ri.mime_type,
                'file_size_bytes', ri.file_size_bytes,
                'created_at', ri.created_at,
                'content_url', '/api/catalog/review-images/' || ri.id || '/content'
              )
              ORDER BY ri.created_at
            )
            FROM review_images ri
            WHERE ri.review_id = r.id
          ), '[]'::json) AS images
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        WHERE r.item_id = $1
        ORDER BY r.created_at DESC
      `,
      [itemId]
    );

    const questionResult = await fastify.db.query(
      `
        SELECT qt.id, qt.question, qt.created_at, ask.display_name AS asked_by,
          COALESCE(
            json_agg(
              json_build_object(
                'id', qa.id,
                'body', qa.body,
                'created_at', qa.created_at,
                'answered_by', ans.display_name,
                'is_catalog_editor_answer', qa.is_catalog_editor_answer
              )
              ORDER BY qa.is_catalog_editor_answer DESC, qa.created_at ASC
            ) FILTER (WHERE qa.id IS NOT NULL),
            '[]'::json
          ) AS answers
        FROM qa_threads qt
        JOIN users ask ON ask.id = qt.asked_by
        LEFT JOIN qa_answers qa ON qa.thread_id = qt.id
        LEFT JOIN users ans ON ans.id = qa.answered_by
        WHERE qt.item_id = $1
        GROUP BY qt.id, ask.display_name
        ORDER BY qt.created_at DESC
      `,
      [itemId]
    );

    const favoritesResult = await fastify.db.query(
      `
        SELECT i.id, i.sku, i.name, f.created_at
        FROM favorites f
        JOIN items i ON i.id = f.item_id
        WHERE f.user_id = $1
        ORDER BY f.created_at DESC
        LIMIT 10
      `,
      [request.authUser!.id]
    );

    const historyResult = await fastify.db.query(
      `
        SELECT bh.id, bh.viewed_at, i.id AS item_id, i.sku, i.name
        FROM browsing_history bh
        JOIN items i ON i.id = bh.item_id
        WHERE bh.user_id = $1
        ORDER BY bh.viewed_at DESC
        LIMIT 10
      `,
      [request.authUser!.id]
    );

    return {
      item: itemResult.rows[0],
      reviews: reviewResult.rows,
      questions: questionResult.rows,
      favorites: favoritesResult.rows,
      history: historyResult.rows
    };
  });

  fastify.patch('/catalog/items/:itemId', {
    preHandler: [fastify.authenticate, fastify.requirePermission('catalog.manage')],
    schema: {
      params: itemParamsSchema,
      body: patchItemBodySchema
    }
  }, async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const body = request.body as {
      name?: string;
      description?: string;
      unitOfMeasure?: string;
      temperatureBand?: string;
      weightLbs?: number;
      lengthIn?: number;
      widthIn?: number;
      heightIn?: number;
    };
    await accessControl.ensureItemAccess(request.authUser!, itemId);

    const updates: string[] = [];
    const values: unknown[] = [];
    const push = (column: string, value: unknown) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return reply.code(422).send({ message: 'Item name is required' });
      }
      push('name', name);
    }

    if (body.description !== undefined) {
      push('description', String(body.description).trim() || null);
    }

    if (body.unitOfMeasure !== undefined) {
      const unitOfMeasure = String(body.unitOfMeasure).trim();
      if (!unitOfMeasure) {
        return reply.code(422).send({ message: 'Unit of measure is required' });
      }
      push('unit_of_measure', unitOfMeasure);
    }

    if (body.temperatureBand !== undefined) {
      const temperatureBand = String(body.temperatureBand).trim();
      if (!temperatureBand) {
        return reply.code(422).send({ message: 'Temperature band is required' });
      }
      push('temperature_band', temperatureBand);
    }

    for (const [field, column] of [
      ['weightLbs', 'weight_lbs'],
      ['lengthIn', 'length_in'],
      ['widthIn', 'width_in'],
      ['heightIn', 'height_in']
    ] as const) {
      const value = body[field];
      if (value !== undefined) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) {
          return reply.code(422).send({ message: `${field} must be zero or greater` });
        }
        push(column, numeric);
      }
    }

    if (!updates.length) {
      return reply.code(422).send({ message: 'At least one editable item field is required' });
    }

    values.push(itemId);
    const result = await fastify.db.query(
      `
        UPDATE items
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
          AND deleted_at IS NULL
        RETURNING id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in
      `,
      values
    );

    if (!result.rowCount) {
      return reply.code(404).send({ message: 'Item not found' });
    }

    request.auditContext = {
      actionType: 'catalog_item_update',
      resourceType: 'item',
      resourceId: itemId,
      details: {
        updatedFields: updates.map((entry) => entry.split(' = ')[0])
      }
    };

    return result.rows[0];
  });
};
