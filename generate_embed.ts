export const generateScript = (organizationId) => {
  return `
var mGLPOSbscript = document.createElement('script');
mGLPOSbscript.type = 'text/javascript';
mGLPOSbscript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
mGLPOrevisionId = null;
mGLPOScrollPercentage = 0;

const mGLPOScripts = document.getElementsByTagName('script');

// headの最下部に追加
const mGLPOLastScript = mGLPOScripts[mGLPOScripts.length - 1];
mGLPOLastScript.parentNode.insertBefore(
  mGLPOSbscript,
  mGLPOLastScript.nextSibling
);

const mGLPOIsMobile = window.screen.width < 768;
const today = new Date().toISOString().split('T')[0];

mGLPOSbscript.onload = async function () {
  const organizationId = '${organizationId}';
  const mGLPOsupabaseUrl =
    'https://${process.env.SUPABASE_PROJECT_REF}.supabase.co';
  const mGLPOsupabaseKey = '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}';
  const mGLPOsb = supabase.createClient(mGLPOsupabaseUrl, mGLPOsupabaseKey);

  const currentUrl = new URL(window.location.href);
  const formattedUrl = currentUrl.href.endsWith('/')
    ? currentUrl.href.slice(0, -1)
    : currentUrl.href;
  const formattedUrlWithoutParams = formattedUrl.split('?')[0];
  const formattedUrlWithSlash = formattedUrl + '/';

  const previewRevisionId = currentUrl.searchParams.get('preview_revision_id');
  const disabled = currentUrl.searchParams.get('mgclpo_disabled');

  async function checkConditions(projectId) {
    const { data: conditions, error } = await mGLPOsb
      .from('analysis_project_conditions')
      .select('*')
      .eq('analysis_project_id', projectId);

    if (conditions.length === 0) {
      return true;
    }

    if (error) {
      console.error(error);
      return false;
    } else {
      console.info('conditions');
      console.info(conditions);
    }

    return conditions.every((condition) => {
      const { match_type, match_text } = condition;
      const url = window.location.href;
      console.warn('condition', condition);

      switch (match_type) {
        case 'match':
          return url === match_text;
        case 'not_match':
          return url !== match_text;
        case 'contains':
          return url.includes(match_text);
        case 'not_contains':
          return !url.includes(match_text);
        default:
          return false;
      }
    });
  }

  // ABテストを実行するかどうかを判断する関数
  async function shouldRunABTest(projectData) {
    for (const project of projectData) {
      const conditionsMet = await checkConditions(project.id);

      if (conditionsMet) {
        return true;
      }
    }
    return false;
  }

  if (disabled) {
    document.body.style.visibility = 'visible';
    return;
  }

  if (previewRevisionId) {
    console.info('previewRevisionId', previewRevisionId);
    mGLPOrevisionId = previewRevisionId;
    await replacePreviewChanges();
    document.body.style.visibility = 'visible';
    return;
  }

  // get latest
  const { data: analysisProjectData, error: analysisProjectError } =
    await mGLPOsb
      .from('analysis_projects')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_published', true)
      .or(
        'website_url.eq.' +
          formattedUrlWithoutParams +
          ',website_url.eq.' +
          formattedUrlWithSlash
      )
      .or(
        'enable_for_pc.eq.' +
          !mGLPOIsMobile +
          ',enable_for_mobile.eq.' +
          mGLPOIsMobile
      )
      .lte('test_period_start', today)
      .gte('test_period_end', today)
      .order('created_at', { ascending: false });

  console.warn('analysisProjectData: ', analysisProjectData);

  if (analysisProjectData[0] == null) {
    document.body.style.visibility = 'visible';
    return;
  }

  const mGLPORunABTest = await shouldRunABTest(analysisProjectData);
  if (!mGLPORunABTest) {
    console.warn(
      'ABテストを実行しません、conditionsに一致するプロジェクトがありませんでした'
    );
    document.body.style.visibility = 'visible';
    return;
  }

  console.info('ABテストを実行します');
  document.body.style.visibility = 'hidden';

  async function replaceChanges(analysisProjectData) {
    for (const item of analysisProjectData) {
      const { data, error } = await mGLPOsb
        .from('analysis_changes')
        .select('*')
        .eq('analysis_project_id', item.id);

      if (error) {
        console.error(error);
        return;
      }

      console.info(data);

      data.forEach((element) => {
        try {
          const target = document.querySelector(element.selector);
          if (
            (target && element.change_type === 'update') ||
            (target && element.change_type === 'html')
          ) {
            target.innerHTML = element.html;
          }
          if (target && element.change_type === 'text') {
            target.innerText = element.innerText;
          }
          if (target && element.change_type === 'remove') {
            target.remove();
          }
          if (target && element.change_type === 'image_url') {
            target.src = element.imageUrl;
            target.srcset = element.imageUrl;
            const picture = target.closest('picture');
            if (picture) {
              const source = picture.querySelectorAll('source');
              source.forEach((s) => {
                s.srcset = element.imageUrl;
              });
            }
          }
          if (target && element.change_type === 'move') {
            const moveTo = element.movedToSelector;
            const movedTo = document.querySelector(moveTo);
            movedTo.append(target);
            target.remove();
          }
          // Apply additional styles if present
          if (target && element.additionalStyles) {
            target.style.cssText += "; " + element.additionalStyles;
          }
        } catch (error) {
          console.error(error);
        }
      });
    }
  }

  async function replacePreviewChanges() {
    console.info('replacePreviewChanges: analysisProjectData');
    const { data: analysisProjectData, error: analysisProjectError } =
      await mGLPOsb
        .from('analysis_projects')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('target_revision_id', previewRevisionId)
        .order('created_at', { ascending: false });

    console.info(analysisProjectData);
    console.info(analysisProjectError);

    await replaceChanges(analysisProjectData);
  }

  // データを挿入する関数
  async function insertData(x, y, width, value, event_type) {
    if (!analysisProjectData[0] || mGLPOrevisionId === null) return;
    const { data, error } = await mGLPOsb.from('heatmap_events').insert([
      {
        x,
        y,
        width,
        value,
        analysis_project_id: analysisProjectData[0]?.id,
        revision_id: mGLPOrevisionId,
        device_type: mGLPOIsMobile ? 'mobile' : 'pc',
        event_type,
      },
    ]);

    if (error) {
      console.error(error);
      return;
    }

    console.log(data);
  }

  const ratio = analysisProjectData[0].target_ratio / 100 || 0.5;
  console.info('ratio', ratio);

  if (Math.random() < ratio) {
    mGLPOrevisionId = analysisProjectData[0].target_revision_id;
    await replaceChanges(analysisProjectData);
  } else {
    mGLPOrevisionId = analysisProjectData[0].original_revision_id;
  }
  console.info('mGLPOrevisionId', mGLPOrevisionId);

  try {
    // for gtag.js
    if (gtag !== 'undefined')
      gtag('event', 'loaded', { revision_id: mGLPOrevisionId.toString() });
  } catch (error) {
    console.error(error);
  }

  try {
    // for analytics.js
    if (ga !== 'undefined')
      ga('send', 'event', 'loaded', 'loaded', {
        revision_id: mGLPOrevisionId.toString(),
      });
  } catch (error) {
    console.error(error);
  }
    

  if (typeof dataLayer !== "undefined") {
    dataLayer.push({
      event: 'revision_event',
      revision_id: previewRevisionId || mGLPOrevisionId.toString(),
    });
  }
  document.body.style.visibility = 'visible';

  function debounce(func, delay) {
    let debounceTimer;
    return function (event) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        func.call(this, event);
      }, delay);
    };
  }

  document.body.addEventListener('click', function (event) {
    var x = event.pageX - event.currentTarget.offsetLeft;
    var y = event.pageY - event.currentTarget.offsetTop;
    var value = 1;
    var point = { x: x, y: y, value: value };

    // var max = 100;
    // heatmapInstance.addData(point);
    insertData(x, y, window.innerWidth, value);
  });

  function handleMouseMove(event) {
    var x = event.pageX;
    var y = event.pageY;
    var value = 0.1;
    insertData(x, y, window.innerWidth, value);
  }

  const handleScroll = () => {
    const scrolledFromTop = window.scrollY;
    const totalHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercentage = (scrolledFromTop / totalHeight) * 100;

    // 5%増えるたびに1回送信
    if (scrollPercentage - mGLPOScrollPercentage >= 5) {
      mGLPOScrollPercentage = scrollPercentage;
      insertData(
        window.innerWidth / 2,
        scrolledFromTop,
        window.innerWidth,
        scrollPercentage,
        'scroll'
      );
      return;
    }
  };

  window.addEventListener('scroll', handleScroll);
  document.body.addEventListener('mousemove', debounce(handleMouseMove, 500));
};
  `;
};
