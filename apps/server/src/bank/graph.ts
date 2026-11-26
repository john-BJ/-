/**
 * 学科脉络数据。
 *
 * 数学：依据工作区《高中数学知识图谱（人教 B 版）》整理，逐章压缩为可折叠导航结构。
 * 物理：⚠ 本轮无教材/图谱资料，按人教 2019 版通用目录自拟，仅作学科导航骨架，
 *       不参与判题、不建题库。已在 README「已知缺口」中标注，待用户提供资料后替换。
 */

export interface GraphChapter {
  chapter: string
  book: string
  concepts: string[]
  formulas: string[]
  methods: string[]
  traps: string[]
}

export interface GraphLine {
  line: string
  desc: string
  chapters: GraphChapter[]
}

export interface SubjectGraph {
  subject: 'math' | 'physics'
  title: string
  source: string
  verified: boolean
  lines: GraphLine[]
}

const mathGraph: SubjectGraph = {
  subject: 'math',
  title: '高中数学知识脉络（人教 B 版）',
  source: '工作区《高中数学知识图谱.md》整理',
  verified: true,
  lines: [
    {
      line: '一、预备知识',
      desc: '语言与工具：集合、逻辑、等式与不等式',
      chapters: [
        {
          chapter: '集合与常用逻辑用语',
          book: '必修一',
          concepts: ['集合三性质：确定性、互异性、无序性', '子集、真子集、交并补', '充分条件与必要条件', '全称量词与存在量词'],
          formulas: ['A⊆B ⇔ A∩B=A ⇔ A∪B=B', '∁ᵤA 与 A 互补'],
          methods: ['分类讨论（含参必讨论 ∅）', '数轴与 Venn 图', '正难则反（补集思想）'],
          traps: ['空集是任何集合的子集，最容易漏', '命题否定要"改量词、否结论"'],
        },
        {
          chapter: '等式与不等式',
          book: '必修一',
          concepts: ['一元二次方程根的判别式', '根与系数关系', '一元二次不等式解集', '均值不等式'],
          formulas: ['Δ=b²−4ac', 'x₁+x₂=−b/a，x₁x₂=c/a', 'a+b ≥ 2√(ab)（a,b>0）'],
          methods: ['三个"二次"贯通（函数↔方程↔不等式）', '配方法、作差法'],
          traps: ['均值不等式必须验证"一正二定三相等"', '含参不等式按二次项系数、Δ、根大小三层讨论'],
        },
      ],
    },
    {
      line: '二、函数主线',
      desc: '从具体函数到抽象性质，再到变化率',
      chapters: [
        {
          chapter: '函数',
          book: '必修一',
          concepts: ['三要素：定义域、值域、对应法则', '单调性、奇偶性、最值', '零点与零点存在性定理'],
          formulas: ['f(−x)=−f(x) 奇函数', 'f(−x)=f(x) 偶函数', 'f(a)·f(b)<0 ⇒ (a,b) 内有零点'],
          methods: ['定义域优先', '数形结合', '方程根 ⇔ 函数零点 ⇔ 图象交点'],
          traps: ['判断奇偶性先看定义域是否关于原点对称', '单调区间不能并集，只能逗号分隔'],
        },
        {
          chapter: '指数函数、对数函数与幂函数',
          book: '必修二',
          concepts: ['n 次方根与分数指数幂', '对数定义 aˣ=N ⇔ x=log_aN', '指数/对数/幂函数图象与性质', '互为反函数'],
          formulas: ['aᵐ·aⁿ=aᵐ⁺ⁿ', 'log_a(MN)=log_aM+log_aN', '换底 log_ab=log_cb/log_ca', '增长：指数 > 幂 > 对数'],
          methods: ['同底化归', '中间量 0 与 1', '换元法'],
          traps: ['真数>0、底数>0 且≠1', '底数 a>1 与 0<a<1 必须分类', '换元后新元范围（如 t=2ˣ>0）'],
        },
        {
          chapter: '三角函数',
          book: '必修三',
          concepts: ['任意角与弧度制', '单位圆定义', '正弦型函数 y=Asin(ωx+φ)'],
          formulas: ['π rad = 180°', 'sin²α+cos²α=1', 'T=2π/ω'],
          methods: ['整体代换（ωx+φ 看作整体）', '化归到锐角'],
          traps: ['由图象求 φ 要注意取值范围', '单调区间受 ω 正负影响'],
        },
        {
          chapter: '数列',
          book: '选必三',
          concepts: ['通项与递推', '等差/等比数列', 'Sₙ 与 aₙ 的关系'],
          formulas: ['aₙ=a₁+(n−1)d', 'Sₙ=n(a₁+aₙ)/2', 'Sₙ=a₁(1−qⁿ)/(1−q)'],
          methods: ['累加、累乘、构造法', '裂项相消、错位相减'],
          traps: ['等比求和必须讨论 q=1', 'Sₙ 求 aₙ 要分 n=1 与 n≥2'],
        },
        {
          chapter: '导数及其应用',
          book: '选必三',
          concepts: ['平均变化率与瞬时变化率', '导数几何意义（切线斜率）', '单调性、极值、最值'],
          formulas: ['(xⁿ)′=nxⁿ⁻¹', '(eˣ)′=eˣ', '(lnx)′=1/x'],
          methods: ['以直代曲', '导数符号 ↔ 图象升降'],
          traps: ['"在某点"与"过某点"的切线不同', 'f′(x₀)=0 不一定是极值点'],
        },
      ],
    },
    {
      line: '三、几何与代数',
      desc: '向量为桥，坐标法统一几何',
      chapters: [
        {
          chapter: '平面向量初步',
          book: '必修二',
          concepts: ['向量的线性运算', '平面向量基本定理', '坐标表示'],
          formulas: ['a∥b ⇔ x₁y₂−x₂y₁=0', '中点坐标公式'],
          methods: ['基底思想', '回路法'],
          traps: ['零向量与任意向量共线', '向量不能比较大小'],
        },
        {
          chapter: '数量积与三角恒等变换',
          book: '必修三',
          concepts: ['数量积（结果是数）', '投影与夹角', '和差角与二倍角'],
          formulas: ['a·b=|a||b|cosθ=x₁x₂+y₁y₂', 'a⊥b ⇔ a·b=0', 'cos2α=2cos²α−1'],
          methods: ['三看：看角、看函数名、看次数', '辅助角公式'],
          traps: ['数量积不满足结合律', '夹角范围 [0,π]'],
        },
        {
          chapter: '解三角形',
          book: '必修四',
          concepts: ['正弦定理、余弦定理', '解三角形四类基本型'],
          formulas: ['a/sinA=2R', 'a²=b²+c²−2bccosA', 'S=½absinC'],
          methods: ['边角互化', '方程思想'],
          traps: ['SSA 可能两解，必须讨论', '勾股定理是余弦定理特例'],
        },
        {
          chapter: '复数',
          book: '必修四',
          concepts: ['虚数单位 i', '复平面与共轭', '模'],
          formulas: ['i²=−1', '|z|=√(a²+b²)', 'z·z̄=|z|²'],
          methods: ['复数问题实数化'],
          traps: ['纯虚数要求 a=0 且 b≠0', 'i 的周期性（周期 4）'],
        },
        {
          chapter: '立体几何初步',
          book: '必修四',
          concepts: ['空间几何体与三视图', '点线面位置关系', '平行与垂直的判定'],
          formulas: ['V柱=Sh', 'V锥=⅓Sh', 'V球=4/3πR³'],
          methods: ['降维', '等体积法、割补法'],
          traps: ['线面平行判定与性质方向不能反', '面面垂直 ⇒ 线面垂直是关键定理'],
        },
        {
          chapter: '空间向量与立体几何',
          book: '选必一',
          concepts: ['空间向量基本定理', '空间直角坐标系', '法向量'],
          formulas: ['a·b=x₁x₂+y₁y₂+z₁z₂', 'd=|AP·n|/|n|'],
          methods: ['三部曲：建系→求坐标→算结果'],
          traps: ['线面角用 sin，要加绝对值', '二面角需判断锐钝'],
        },
        {
          chapter: '平面解析几何',
          book: '选必一',
          concepts: ['直线方程五种形式', '圆的方程', '椭圆/双曲线/抛物线'],
          formulas: ['k=(y₂−y₁)/(x₂−x₁)', 'e=c/a', 'y²=2px'],
          methods: ['坐标法', '设而不求 + 韦达定理'],
          traps: ['斜率不存在要单独讨论', '联立后必须验证 Δ'],
        },
      ],
    },
    {
      line: '四、概率与统计',
      desc: '从数据描述到随机模型',
      chapters: [
        {
          chapter: '统计与概率',
          book: '必修二',
          concepts: ['抽样方法', '数字特征', '古典概型', '独立性'],
          formulas: ['s²=(1/n)Σ(xᵢ−x̄)²', 'P(A∪B)=P(A)+P(B)（互斥）', 'P(AB)=P(A)P(B)（独立）'],
          methods: ['用样本估计总体', '复杂事件分解'],
          traps: ['直方图纵轴是"频率/组距"', '互斥 ≠ 独立'],
        },
        {
          chapter: '排列、组合与二项式定理',
          book: '选必二',
          concepts: ['两个计数原理', '排列与组合', '二项展开式通项'],
          formulas: ['Aₙᵐ=n!/(n−m)!', 'Cₙᵐ=n!/[m!(n−m)!]', 'T_{k+1}=Cₙᵏaⁿ⁻ᵏbᵏ'],
          methods: ['捆绑、插空、隔板、间接法'],
          traps: ['有序是排列、无序是组合', '系数最大项 ≠ 二项式系数最大项'],
        },
        {
          chapter: '概率与统计（续）',
          book: '选必二',
          concepts: ['条件概率与全概率', '二项/超几何/正态分布', '期望与方差', '回归与独立性检验'],
          formulas: ['P(B|A)=P(AB)/P(A)', 'E(X)=np（二项）', 'D(X)=np(1−p)'],
          methods: ['全概率分解', '假设检验思想'],
          traps: ['有放回是二项、不放回是超几何', '独立性检验结论要带概率表述'],
        },
      ],
    },
    {
      line: '五、建模与探究',
      desc: '贯穿六册的数学建模活动',
      chapters: [
        {
          chapter: '数学建模活动',
          book: '贯穿',
          concepts: ['实际问题 → 数学问题 → 模型 → 求解 → 检验'],
          formulas: [],
          methods: ['函数拟合', '数据分析'],
          traps: ['建模题必须回到实际情境解释结果'],
        },
      ],
    },
  ],
}

const physicsGraph: SubjectGraph = {
  subject: 'physics',
  title: '高中物理知识脉络（人教 2019 版）',
  source: '⚠ 本轮无教材资料，按通用目录自拟，仅作导航',
  verified: false,
  lines: [
    {
      line: '一、力学基础',
      desc: '运动描述 → 相互作用 → 牛顿定律',
      chapters: [
        {
          chapter: '运动的描述',
          book: '必修一',
          concepts: ['质点与参考系', '位移与速度', '加速度'],
          formulas: ['v=Δx/Δt', 'a=Δv/Δt'],
          methods: ['图象法（x-t、v-t）'],
          traps: ['加速度方向与速度方向不一定相同'],
        },
        {
          chapter: '相互作用——力',
          book: '必修一',
          concepts: ['重力、弹力、摩擦力', '力的合成与分解', '共点力平衡'],
          formulas: ['f=μN', 'F=√(F₁²+F₂²+2F₁F₂cosθ)'],
          methods: ['正交分解', '整体法与隔离法'],
          traps: ['静摩擦力大小由平衡条件决定，不能用 μN'],
        },
        {
          chapter: '运动和力的关系',
          book: '必修一',
          concepts: ['牛顿三定律', '超重与失重', '连接体'],
          formulas: ['F合=ma', 'F₁₂=−F₂₁'],
          methods: ['受力分析四步法', '整体法求加速度、隔离法求内力'],
          traps: ['质量是惯性唯一量度', '作用力反作用力不做功分析'],
        },
      ],
    },
    {
      line: '二、曲线运动与能量',
      desc: '抛体、圆周、万有引力、机械能',
      chapters: [
        {
          chapter: '抛体运动',
          book: '必修二',
          concepts: ['运动的合成与分解', '平抛运动'],
          formulas: ['x=v₀t', 'y=½gt²', 'tanθ=gt/v₀'],
          methods: ['分解为两个直线运动'],
          traps: ['平抛时间只由高度决定'],
        },
        {
          chapter: '圆周运动',
          book: '必修二',
          concepts: ['线速度、角速度、周期', '向心加速度', '向心力来源'],
          formulas: ['v=ωr', 'a=v²/r=ω²r', 'F=mv²/r'],
          methods: ['找圆心、定半径、分析向心力来源'],
          traps: ['向心力是效果力，不能重复计入受力'],
        },
        {
          chapter: '万有引力与宇宙航行',
          book: '必修二',
          concepts: ['万有引力定律', '卫星运动', '三个宇宙速度'],
          formulas: ['F=GMm/r²', 'GMm/r²=mv²/r', 'v=√(GM/r)'],
          methods: ['万有引力提供向心力'],
          traps: ['r 是轨道半径，不是星球半径'],
        },
        {
          chapter: '机械能守恒定律',
          book: '必修二',
          concepts: ['功与功率', '动能定理', '机械能守恒'],
          formulas: ['W=Flcosα', 'Ek=½mv²', 'P=Fv'],
          methods: ['动能定理处理变力做功', '守恒条件判断'],
          traps: ['有摩擦时机械能不守恒，但可用能量守恒'],
        },
      ],
    },
    {
      line: '三、电与磁',
      desc: '静电场 → 电路 → 电磁感应',
      chapters: [
        {
          chapter: '静电场及其能量',
          book: '必修三',
          concepts: ['库仑定律', '电场强度、电场线', '电势、电势能、电势差', '电容'],
          formulas: ['F=kq₁q₂/r²', 'E=F/q', 'U=Ed', 'C=Q/U'],
          methods: ['电场线与等势面结合'],
          traps: ['E 与 φ 无必然大小关系', '电势能正负要看电荷正负'],
        },
        {
          chapter: '电路及其应用',
          book: '必修三',
          concepts: ['欧姆定律', '串并联', '电功与电热', '电源电动势与内阻'],
          formulas: ['I=U/R', 'P=UI', 'U=E−Ir'],
          methods: ['等效电路化简', '伏安法测电阻'],
          traps: ['非纯电阻电路 P≠I²R'],
        },
        {
          chapter: '电磁感应与电磁波初步',
          book: '必修三',
          concepts: ['磁通量', '楞次定律', '法拉第电磁感应定律'],
          formulas: ['Φ=BS', 'E=nΔΦ/Δt', 'E=BLv'],
          methods: ['右手定则、楞次定律四步法'],
          traps: ['"阻碍"不是"相反"，要先判原磁通增减'],
        },
      ],
    },
    {
      line: '四、选择性必修',
      desc: '动量、振动与波、光、热、原子',
      chapters: [
        {
          chapter: '动量守恒定律',
          book: '选必一',
          concepts: ['冲量与动量', '动量定理', '碰撞与反冲'],
          formulas: ['p=mv', 'Ft=Δp', 'm₁v₁+m₂v₂=m₁v₁′+m₂v₂′'],
          methods: ['守恒条件判断', '弹性/完全非弹性碰撞'],
          traps: ['动量是矢量，必须规定正方向'],
        },
        {
          chapter: '机械振动与机械波',
          book: '选必一',
          concepts: ['简谐运动', '单摆', '波的传播与干涉'],
          formulas: ['T=2π√(l/g)', 'v=λf'],
          methods: ['振动图象与波形图互推'],
          traps: ['质点不随波迁移'],
        },
        { chapter: '光', book: '选必一', concepts: ['折射与全反射', '干涉、衍射', '光电效应'], formulas: ['n=sinθ₁/sinθ₂', 'sinC=1/n', 'Ek=hν−W₀'], methods: ['光路作图'], traps: ['全反射必须从光密到光疏'] },
        { chapter: '热学', book: '选必三', concepts: ['分子动理论', '气体实验定律', '热力学定律'], formulas: ['pV/T=C', 'ΔU=Q+W'], methods: ['理想气体状态方程'], traps: ['W 的正负号约定'] },
        { chapter: '原子与原子核', book: '选必三', concepts: ['波粒二象性', '原子结构', '衰变与核反应'], formulas: ['E=hν', 'E=mc²'], methods: ['守恒律（质量数、电荷数）'], traps: ['半衰期是统计规律'] },
      ],
    },
  ],
}

export const GRAPHS: Record<'math' | 'physics', SubjectGraph> = {
  math: mathGraph,
  physics: physicsGraph,
}
