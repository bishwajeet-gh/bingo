$(async function () {
    const service = new AdminDataService();

    async function load() {
        const tableBody = $('#adminTableBody');
        tableBody.html('<tr><td colspan="5" class="text-center text-muted">Loading...</td></tr>');
        try {
            const all = await service.getAllProgress();
            const users = Object.keys(all || {}).sort((a, b) => a.localeCompare(b));

            // Stats
            const totalUsers = users.length;
            const usersWithBingo = users.filter(u => (all[u]?.bingoCount || 0) > 0).length;
            const totalBingos = users.reduce((acc, u) => acc + (all[u]?.bingoCount || 0), 0);
            $('#statTotalUsers').text(totalUsers);
            $('#statUsersWithBingo').text(usersWithBingo);
            $('#statTotalBingos').text(totalBingos);

            if (!users.length) {
                tableBody.html('<tr><td colspan="5" class="text-center text-muted">No data yet</td></tr>');
                $('#adminWinnersList').html('<div class="no-winners">No winners yet.</div>');
                return;
            }

            tableBody.empty();
            users.forEach(name => {
                const s = all[name] || {};
                const completed = Array.isArray(s.selectedCells) ? s.selectedCells.length : 0;
                const notesArr = s.notesByIndex ? Object.entries(s.notesByIndex) : [];
                const notesHtml = notesArr.length
                    ? `<div class=\"notes-list\">${notesArr
                        .map(([idx, text]) => `
                            <div class=\"note-item\">
                                <div class=\"small text-muted mb-1\">Cell #${Number(idx) + 1}</div>
                                <div class=\"note-text\">${$('<div>').text(text).html()}</div>
                            </div>
                        `).join('')}
                    </div>`
                    : '<span class="text-muted">—</span>';
                const lastSynced = s.lastSynced ? new Date(s.lastSynced).toLocaleString() : '—';

                tableBody.append(`
                    <tr>
                        <td>${name}</td>
                        <td><span class="badge-soft-primary">${s.bingoCount || 0}</span></td>
                        <td>${completed}</td>
                        <td class="notes-cell">${notesHtml}</td>
                        <td>${lastSynced}</td>
                    </tr>
                `);
            });

            // Build winners list (top by score)
            const sortedByScore = users
                .map(u => ({ name: u, score: all[u]?.bingoCount || 0 }))
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 10);

            const winnersList = $('#adminWinnersList');
            if (!sortedByScore.length) {
                winnersList.html('<div class="no-winners">No winners yet.</div>');
            } else {
                winnersList.empty();
                sortedByScore.forEach(w => {
                    winnersList.append(`
                        <div class="winner-item">
                            <span class="winner-name">${w.name}</span>
                            <span class="winner-score">${w.score} BINGOs</span>
                        </div>
                    `);
                });
            }
        } catch (e) {
            console.error('Admin load error:', e);
            tableBody.html('<tr><td colspan="5" class="text-center text-danger">Failed to load</td></tr>');
        }
    }

    $('#refreshAdmin').on('click', load);
    await load();
});


