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
  const api = { validSpeed, findResume };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.playbackUtils = api;
})(globalThis);
