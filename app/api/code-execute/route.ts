import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const execAsync = promisify(exec);

interface ExecutionRequest {
  code: string;
  language: string;
  input: string;
  timeout?: number;
}

// Language configurations
const languageConfig: Record<string, { 
  extension: string; 
  command: (filePath: string, input: string) => string;
}> = {
  python: {
    extension: '.py',
    command: (filePath, input) => `python3 "${filePath}" <<< "${input.replace(/"/g, '\\"')}"`,
  },
  javascript: {
    extension: '.js',
    command: (filePath, input) => `node "${filePath}" <<< "${input.replace(/"/g, '\\"')}"`,
  },
  cpp: {
    extension: '.cpp',
    command: (filePath, input) => {
      const exePath = filePath.replace('.cpp', '');
      return `g++ -o "${exePath}" "${filePath}" && "${exePath}" <<< "${input.replace(/"/g, '\\"')}"`;
    },
  },
  java: {
    extension: '.java',
    command: (filePath, input) => {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      return `cd "${dir}" && javac Solution.java && java Solution <<< "${input.replace(/"/g, '\\"')}"`;
    },
  },
};

// Wrap user code with boilerplate (LeetCode style)
function wrapCode(code: string, language: string, input: string): string {
  const testInput = input.trim();
  
  // Parse input: "nums = [2,7,11,15], target = 9"
  const numsMatch = testInput.match(/nums\s*=\s*\[(.*?)\]/);
  const targetMatch = testInput.match(/target\s*=\s*(\d+)/);
  
  const numsStr = numsMatch ? numsMatch[1] : '2,7,11,15';
  const targetStr = targetMatch ? targetMatch[1] : '9';
  
  switch (language) {
    case 'python':
      return `${code}

# Solution
nums = [${numsStr}]
target = ${targetStr}
result = twoSum(nums, target)

# Output
if isinstance(result, list):
    print('[' + ','.join(map(str, result)) + ']')
else:
    print(result)`;

    case 'javascript':
      return `${code}

// Solution
const nums = [${numsStr}];
const target = ${targetStr};
const result = twoSum(nums, target);

// Output
if (Array.isArray(result)) {
  console.log('[' + result.join(',') + ']');
} else {
  console.log(result);
}`;

    case 'cpp':
      return `#include <iostream>
#include <vector>
using namespace std;

${code}

int main() {
    vector<int> nums = {${numsStr}};
    int target = ${targetStr};
    
    Solution sol;
    vector<int> result = sol.twoSum(nums, target);
    
    cout << "[";
    for (int i = 0; i < result.size(); i++) {
        if (i > 0) cout << ",";
        cout << result[i];
    }
    cout << "]" << endl;
    
    return 0;
}`;

    case 'java':
      // Extract just the method from the user's code
      const methodMatch = code.match(/public\s+int\[\]\s+twoSum\s*\([^)]*\)\s*\{[\s\S]*\}/);
      const methodCode = methodMatch ? methodMatch[0] : code;
      
      return `public class Solution {
    ${methodCode}
    
    public static void main(String[] args) throws Exception {
        int[] nums = {${numsStr}};
        int target = ${targetStr};
        
        Solution sol = new Solution();
        int[] result = sol.twoSum(nums, target);
        
        System.out.print("[");
        for (int i = 0; i < result.length; i++) {
            if (i > 0) System.out.print(",");
            System.out.print(result[i]);
        }
        System.out.println("]");
    }
}`;

    default:
      return code;
  }
}

async function executeCode(
  code: string,
  language: string,
  input: string,
  timeout: number = 5000
): Promise<{ output: string; error?: string }> {
  const config = languageConfig[language];
  if (!config) {
    return { output: '', error: `Language '${language}' is not supported` };
  }

  // Wrap user code with boilerplate
  const wrappedCode = wrapCode(code, language, input);

  const fileName = language === 'java' ? 'Solution.java' : `solution_${randomBytes(8).toString('hex')}${config.extension}`;
  const filePath = join(tmpdir(), fileName);

  try {
    // Write code to temporary file
    await writeFile(filePath, wrappedCode);
    
    console.log(`[${language}] Executing at: ${filePath}`);
    console.log(`[${language}] Code:\n${wrappedCode}\n`);

    // Execute code with timeout
    const { stdout, stderr } = await execAsync(config.command(filePath, input), {
      timeout: timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    console.log(`[${language}] stdout: ${stdout}`);
    console.log(`[${language}] stderr: ${stderr}`);

    if (stderr && language !== 'cpp') {
      return { output: '', error: stderr };
    }

    return { output: stdout.trim() };
  } catch (error: any) {
    console.log(`[${language}] Execution error:`, error);
    
    let errorMessage = 'Unknown error';

    if (error.killed) {
      errorMessage = `Code execution timed out (>${timeout}ms)`;
    } else if (error.stderr) {
      errorMessage = error.stderr;
    } else if (error.stdout) {
      return { output: error.stdout.trim() };
    } else {
      errorMessage = error.message || 'Execution failed';
    }

    return { output: '', error: errorMessage };
  } finally {
    // Cleanup temporary file
    try {
      await unlink(filePath);
      if (language === 'cpp') {
        const exePath = filePath.replace('.cpp', '');
        await unlink(exePath).catch(() => {});
      }
      if (language === 'java') {
        const classPath = filePath.replace('.java', '.class');
        await unlink(classPath).catch(() => {});
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExecutionRequest;
    const { code, language, input, timeout = 5000 } = body;

    if (!code || !language || input === undefined) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: code, language, input' },
        { status: 400 }
      );
    }

    if (!languageConfig[language]) {
      return NextResponse.json(
        { ok: false, error: `Unsupported language: ${language}` },
        { status: 400 }
      );
    }

    const result = await executeCode(code, language, input, timeout);

    return NextResponse.json({
      ok: true,
      output: result.output,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Code execution error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
