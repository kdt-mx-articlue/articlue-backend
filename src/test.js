const readline = require("readline");
const axios = require("axios");

const NODE_BASE_URL = process.env.NODE_BASE_URL || "http://localhost:3000";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function main() {
    console.log("========================================");
    console.log(" Articlue 면접 챗봇 CLI 테스트");
    console.log("========================================");
    console.log("종료 명령:");
    console.log("- /finish : 면접 정상 종료 및 리포트 생성");
    console.log("- /exit   : CLI만 종료, DB 세션은 IN_PROGRESS로 남음");
    console.log("");

    const resumeIdInput = await ask("resumeId 입력: ");
    const jobPostingIdInput = await ask("jobPostingId 입력: ");

    const resumeId = Number(resumeIdInput || 1);
    const jobPostingId = Number(jobPostingIdInput || 1);

    const startPayload = {
        resumeId,
        jobPostingId,
        targetCompany: "CLI 테스트 기업",
        jobPostingTitle: "CLI 테스트 공고",
        interviewType: "GENERAL",
        questionSetCount: 5,
        chatMode: "TEXT",
        interviewerStyle: "CALM",
    };

    console.log("");
    console.log("[면접 시작 요청]");
    console.log(startPayload);

    const startResponse = await axios.post(
        `${NODE_BASE_URL}/api/interviews/sessions`,
        startPayload
    );

    const startData = startResponse.data.data;

    let interviewSessionId = startData.interviewSessionId;
    let currentQuestion = startData.question;

    console.log("");
    console.log("========================================");
    console.log(`면접 세션 시작: ${interviewSessionId}`);
    console.log("========================================");
    printQuestion(currentQuestion);

    while (true) {
        const answer = await ask("\n답변 입력: ");

        if (answer === "/exit") {
            console.log("");
            console.log("CLI를 종료합니다.");
            console.log("주의: DB의 면접 세션은 IN_PROGRESS 상태로 남습니다.");
            break;
        }

        if (answer === "/finish") {
            await finishInterview(interviewSessionId);
            break;
        }

        if (!answer.trim()) {
            console.log("답변을 입력해 주세요.");
            continue;
        }

        const answerUrl =
            `${NODE_BASE_URL}/api/interviews/sessions/${interviewSessionId}` +
            `/questions/${currentQuestion.interviewQaId}/answer`;

        console.log("");
        console.log("[답변 제출 요청]");
        console.log(`sessionId: ${interviewSessionId}`);
        console.log(`qaId: ${currentQuestion.interviewQaId}`);

        const answerResponse = await axios.post(answerUrl, {
            answerContent: answer,
        });

        const answerData = answerResponse.data.data;

        if (answerData.turnScore) {
            console.log("");
            console.log("[이번 답변 점수]");
            console.log(answerData.turnScore);
        }

        if (answerData.finishRequired) {
            console.log("");
            console.log("면접 종료 조건에 도달했습니다.");
            const finishInput = await ask("최종 리포트를 생성할까요? (y/n): ");

            if (finishInput.toLowerCase() === "y") {
                await finishInterview(interviewSessionId);
            } else {
                console.log("종료하지 않았습니다. 세션은 IN_PROGRESS로 남습니다.");
            }

            break;
        }

        if (!answerData.question) {
            console.log("");
            console.log("다음 질문이 없습니다.");
            const finishInput = await ask("최종 리포트를 생성할까요? (y/n): ");

            if (finishInput.toLowerCase() === "y") {
                await finishInterview(interviewSessionId);
            }

            break;
        }

        currentQuestion = answerData.question;
        printProgress(answerData.progress);
        printQuestion(currentQuestion);
    }

    rl.close();
}

function printQuestion(question) {
    console.log("");
    console.log("========================================");
    console.log(`[질문 ${question.questionOrder}]`);
    console.log(`유형: ${question.questionType}`);
    console.log(`면접관: ${question.interviewerRole}`);
    console.log(`꼬리질문 여부: ${question.followUpYn}`);
    console.log("----------------------------------------");
    console.log(question.questionContent);
    console.log("========================================");
}

function printProgress(progress) {
    if (!progress) return;

    console.log("");
    console.log("[진행 상황]");
    console.log(
        `기본질문 ${progress.currentQuestionSetNo}/${progress.questionSetCount}, ` +
        `현재 꼬리질문 ${progress.currentFollowUpCount}/${progress.maxFollowUpPerQuestion}, ` +
        `전체 질문 ${progress.totalQuestionCount}, ` +
        `전체 답변 ${progress.totalAnswerCount}`
    );
}

async function finishInterview(interviewSessionId) {
    console.log("");
    console.log("[면접 종료 요청]");

    const finishResponse = await axios.post(
        `${NODE_BASE_URL}/api/interviews/sessions/${interviewSessionId}/finish`
    );

    const finishData = finishResponse.data.data;

    console.log("");
    console.log("========================================");
    console.log("면접 종료 완료");
    console.log("========================================");
    console.log(`sessionId: ${finishData.interviewSessionId}`);
    console.log(`status: ${finishData.sessionStatus}`);
    console.log("");
    console.log("[최종 리포트]");
    console.log(JSON.stringify(finishData.finalReport, null, 2));
}

main().catch((error) => {
    console.error("");
    console.error("CLI 실행 중 오류 발생");

    if (error.response) {
        console.error("status:", error.response.status);
        console.error("data:", JSON.stringify(error.response.data, null, 2));
    } else {
        console.error(error);
    }

    rl.close();
});