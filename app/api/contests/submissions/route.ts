import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getCurrentUser } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = await getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: 'Database not available' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { contestId, problemIndex, code, language, passed } = body;

    if (!contestId || problemIndex === undefined || !code || !language) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Insert submission into database
    const submission = await db.collection('contest_submissions').insertOne({
      userId: user.id,
      contestId: ObjectId.isValid(contestId) ? new ObjectId(contestId) : contestId,
      problemIndex,
      code,
      language,
      passed: passed === true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      submissionId: submission.insertedId,
      message: passed ? 'All tests passed! Solution submitted.' : 'Solution submitted with failing tests.',
    });
  } catch (error) {
    console.error('Error saving submission:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to save submission' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = await getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: 'Database not available' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const contestId = searchParams.get('contestId');
    const problemIndex = searchParams.get('problemIndex');

    if (!contestId || problemIndex === undefined) {
      return NextResponse.json(
        { ok: false, error: 'Missing contestId or problemIndex' },
        { status: 400 }
      );
    }

    // Fetch user's submission for this problem
    const submission = await db.collection('contest_submissions').findOne({
      userId: user.id,
      contestId: ObjectId.isValid(contestId) ? new ObjectId(contestId) : contestId,
      problemIndex: parseInt(problemIndex || '0'),
    });

    if (!submission) {
      return NextResponse.json({
        ok: true,
        submission: null,
        message: 'No previous submission found',
      });
    }

    return NextResponse.json({
      ok: true,
      submission: {
        id: submission._id,
        code: submission.code,
        language: submission.language,
        passed: submission.passed,
        createdAt: submission.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch submission' },
      { status: 500 }
    );
  }
}
