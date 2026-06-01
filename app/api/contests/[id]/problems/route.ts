import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const problemIndex = parseInt(searchParams.get('index') || '0', 10);

    const db = await getDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: 'Database not available' },
        { status: 503 }
      );
    }

    // Fetch contest
    const contestId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const contest = await db.collection('contests').findOne({
      _id: contestId as any,
    });

    if (!contest) {
      return NextResponse.json(
        { ok: false, error: 'Contest not found' },
        { status: 404 }
      );
    }

    if (!contest.problems || contest.problems.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No problems in this contest' },
        { status: 404 }
      );
    }

    if (problemIndex < 0 || problemIndex >= contest.problems.length) {
      return NextResponse.json(
        { ok: false, error: 'Problem index out of range' },
        { status: 400 }
      );
    }

    const problem = contest.problems[problemIndex];

    return NextResponse.json({
      ok: true,
      problem,
      problemNumber: problemIndex + 1,
      totalProblems: contest.problems.length,
    });
  } catch (error) {
    console.error('Error fetching problem:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch problem' },
      { status: 500 }
    );
  }
}
