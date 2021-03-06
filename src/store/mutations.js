
export default {
    updateData: (state, options) =>
        state[options.type].data = Object.freeze(options.data),
    updateUserData: (state, data) => state.user = data,
    changeView: (state, {view, getters}) => {
        const prevView = getters.view;
        if (prevView === view) return;
        if (view === 'prev') state.view._.pop();
        else state.view._.push(view);

        document.getElementById(getters.view).style.zIndex = 2;
        setTimeout(() => {
            document.getElementById(prevView).style.zIndex = -2
        }, 500);
    },
    changeUserView: (state, view) => state.view.user = view,
    changeViewVol: (state, vol) => {
        !vol.type && (vol = Object.assign({
            type: state.play.type === 'likedVol' ?
                'likedVol' : 'vol'
        }, vol));
        state.view.vol = vol
    },
    changeVolType: (state, type) => state.vols.type = type,
    loadMoreVols: (state, {options, getters}) => {
        if (options.init) {
            document.getElementById('vols').scrollTop = 0;
            return state.vols.index = 12;
        }
        const max = getters._vols.length;
        const preIndex = state.vols.index;
        if (preIndex + 12 >= max)
            state.vols.index = max;
        else state.vols.index = preIndex + 12
    },
    loadMoreSingles: (state, {options, getters}) => {
        if (options.init)
            return state.singles.index = 10;
        const max = state.singles.data.length;
        const preIndex = state.singles.index;
        if (preIndex + 10 >= max)
            state.singles.index = max;
        else state.singles.index = preIndex + 10
    },
    loadMoreCollection: (state, type) => {
        const scale = type === 'vols' || type === 'singles' ?
            12 : 18;
        const max = state[type].liked.length;
        const preIndex = state[type].collectionIndex;
        if (preIndex + scale >= max)
            state[type].collectionIndex = max;
        else state[type].collectionIndex = preIndex + scale
    },
    play: (state, {options, getters, commit}) => {
        if (options.type) {
            state.play.type = options.type;
            if (options.type === 'vol' || options.type === 'likedVol')
                state.play.vol = options.data;
        }
        state.play.index = options.index;
        state.play.playing = true;

        if (!state.play.audio) {
            state.play.audio = new Audio();
            addAudioEvent.bind(this)(state.play.audio, getters, commit);
        }
        const audio = state.play.audio;
        audio.pause();
        audio.src = getters.playData.url;
        audio.volume = state.play.volume / 100;
        audio.load();
    },
    toggle: state => {
        if (!state.play.audio) return;
        if (state.play.playing) {
            state.play.playing = false;
            state.play.audio.pause();
        }
        else
            (state.play.playing = true) && state.play.audio.play();
    },
    control: (state, {type, getters, commit}) => {
        if (!state.play.audio) return;
        let index = state.play.index;
        if (state.play.mode === 1) do {
            index = (index + Math.ceil(Math.random() * 30)) % getters.playList.length;
        } while (index === state.play.index);
        else if (type === 'next')
            index = index + 1 === getters.playList.length ?
                0 : index + 1;
        else index = index - 1 === -1 ?
                getters.playList.length - 1 : index - 1;
        const options = {index: index};
        commit('play', {options, getters})
    },
    changePlayMode: state => state.play.mode === 2 ?
        state.play.mode = 0 : state.play.mode++,
    changePlayRatio: (state, ratio) => state.play.audio.currentTime =
        state.play.audio.duration * ratio / 100,
    changePlayVolume: (state, volume) => {
        state.play.audio.volume = volume / 100;
        state.play.volume = volume;
    },
    updateTime: (state, {type, value}) => state.play.time[type] = value,
    addTask: (state, {task, commit}) => {
        state.tasks.push(task);
        commit('execTask', {task, commit})
    },
    doneTask: (state, task) => {
        const tasks = state.tasks;
        const index = findTask(tasks, task.id);
        state.tasks = tasks.slice(0, index).concat(tasks.slice(index + 1, tasks.length))
    },
    execTask: (state, {task, commit}) => {
        !task && (task = state.tasks[state.tasks.length - 1]);
        task.failed = false;
        task.exec()
            .then(setTimeout(() => commit('doneTask', task), 3000))
            .catch((e) => (task.failed = true) && console.error(e))
    },
    updateFromDb: async (state, {remote, commit, callback}) => {
        state.user = remote.config.get();
        state.vols.data = Object.freeze(await remote.db.vol.get());
        state.singles.data = Object.freeze(await remote.db.single.get());
        state.vols.liked = Object.freeze(await remote.db.vol.getLiked());
        state.singles.liked = Object.freeze(await remote.db.single.getLiked());
        state.tracks.liked = Object.freeze(await remote.db.track.getLiked());
        callback && callback();
        if (document.getElementById('bootScreen').style.display === 'none') return;
        setTimeout(() => document.getElementById('bootScreen').className = 'bootImageHidden', 1000);
        setTimeout(() => document.getElementById('bootScreen').style.display = 'none', 2000)
    },
    updateFromServer: (state, {remote, commit}) => {
        commit('addTask', {
            task: {
                exec: async () => {
                    await remote.sync.vol.update();
                    await remote.sync.single.update();
                    commit('updateFromDb', {remote, commit})
                },
                text: '更新期刊',
                failed: false
            },
            commit: commit
        });
        commit('addTask', {
            task: {
                exec: async () => {
                    await remote.user.getCollection();
                    commit('updateFromDb', {remote, commit})
                },
                text: '更新用户数据',
                failed: false
            },
            commit: commit
        })
    },
    like: (state, {type, data, remote, commit, getters}) => {
        if (state.user.mail === '' || state.user.password === '') return;
        commit('addTask', {
            task: {
                exec: async () => {
                    let callback;
                    if (getters.playData && !data.liked) {
                        let id;
                        if (getters.playData.hasOwnProperty('vol_id'))
                            id = getters.playData.vol_id;
                        else if (getters.playData.hasOwnProperty('track_id'))
                            id = getters.playData.track_id;
                        else id = getters.playData.single_id;

                        data.id === id && (callback = function () {
                            commit('play',
                                {options: {index: state.play.index}, getters, commit})
                        }.bind(this))
                    }

                    type === 'vol' ?
                        await remote.sync.vol.like(data.vol, data.id, data.liked) :
                        await remote.sync.single.like(data.id, data.from, data.liked);
                    commit('updateFromDb', {remote, commit, callback});
                },
                text: '同步收藏',
                failed: false
            },
            commit: commit
        })
    },
    checkUpdate: async (state, remote) => {
        const update = await remote.update.check();
        if (!update) return;
        const desc = update[0].desc.map(desc => `· ${desc}\n`).join('');
        if (remote.dialog.showMessageBox({
                type: 'question',
                buttons: ['取消', update[0].type === 'full' ? '下载' : '安装'],
                defaultId: 1,
                title: '更新',
                message: `Luoo.qy v${update[0].version} 已经迫不及待与你见面~\n\n\n🚀新版本更新了以下内容:\n\n${desc}\n`
            }) === 1) {
            if (update[0].type === 'full') return remote.openURL(update[0].url);
            const success = await remote.update.install(update[1]);
            if (remote.dialog.showMessageBox({
                    type: 'question',
                    buttons: ['完成'],
                    defaultId: 0,
                    title: '更新',
                    message: `${success ? '🌟' : '🙄'}更新${success ? '完成' : '失败'}`
                }) === 0) {
                if (!success) return;
                remote.app.relaunch();
                remote.app.exit(0);
            }
        }
    }
}



function addAudioEvent(audio, getters, commit) {
    audio.addEventListener('canplay', event => event.target.play());
    audio.addEventListener('durationchange', event =>
        commit('updateTime', {
            type: 'total',
            value: event.target.duration
        })
    );
    audio.addEventListener('timeupdate', event =>
        commit('updateTime', {
            type: 'current',
            value: event.target.currentTime,
        })
    );
    audio.addEventListener('ended', () =>
        commit('control', {type: 'next', getters, commit}));
}


function findTask(tasks, id) {
    for (let i=0; i<tasks.length; i++)
        if (tasks[i].id === id) return i
}
