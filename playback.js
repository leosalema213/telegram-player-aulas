(function exposePlayback(root) {
  function validSpeed(speed) {
    return typeof speed === 'number' && Number.isFinite(speed) && speed >= 0.25 && speed <= 2 && Math.abs(speed * 100 - Math.round(speed * 100)) < 1e-8;
  }
  function findResume(courses) {
    let recent;
    for (const course of courses) for (const item of course.lessons) {
      if (!item.done && item.position > 0 && item.position < item.duration && item.updated > (recent?.item.updated || 0)) recent = { course, item };
    }
    if (recent) return recent;
    for (const course of courses) {
      const item = course.lessons.find(lesson => !lesson.done);
      if (item) return { course, item };
    }
  }
  function dashboardMetrics(courses) {
    let lessons = 0, completed = 0, finished = 0, total = 0, remaining = 0;
    for (const course of courses) {
      lessons += course.lessons.length;
      if (course.lessons.length && course.lessons.every(lesson => lesson.done)) finished++;
      for (const lesson of course.lessons) {
        total += lesson.duration;
        if (lesson.done) completed++;
        else remaining += Math.max(0, lesson.duration - lesson.position);
      }
    }
    return { lessons, completed, finished, total, remaining, percent: total ? Math.floor((total - remaining) / total * 100) : 0 };
  }
  const api = { validSpeed, findResume, dashboardMetrics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.playbackUtils = api;
})(globalThis);
