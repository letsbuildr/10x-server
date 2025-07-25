const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiService {
  constructor() {
    const apiKey =
      process.env.GEMINI_API_KEY || "AIzaSyDdwHCd6OgVlhV1Tbr0cWqon96St1FJGv8";
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }

  async generateAllPlatformContent(transcript) {
    try {
      const platforms = {
        linkedin: await this.generateLinkedInContent(transcript),
        twitter: await this.generateTwitterContent(transcript),
        instagram: await this.generateInstagramContent(transcript),
        tiktok: await this.generateTikTokContent(transcript),
        facebook: await this.generateFacebookContent(transcript),
      };

      return platforms;
    } catch (error) {
      console.error("Error generating content for all platforms:", error);
      throw error;
    }
  }

  async generateLinkedInContent(transcript) {
    const prompt = `
You are a world-class LinkedIn content strategist and copywriter with over 15 years of experience creating viral professional content. You understand the LinkedIn algorithm intimately and know exactly what makes posts rank high, get maximum engagement, and convert viewers into followers and customers.

Your mission is to transform the following video transcript into the most compelling, engaging, and shareable LinkedIn post that will:
1. Stop users from scrolling immediately
2. Drive massive engagement (likes, comments, shares)
3. Establish thought leadership and authority
4. Generate meaningful professional discussions
5. Attract ideal connections and opportunities
6. Rank high in LinkedIn's discovery algorithm

VIDEO TRANSCRIPT:
"${transcript}"

LINKEDIN CONTENT STRATEGY GUIDELINES:
- LinkedIn users are professionals seeking career growth, industry insights, business knowledge, and networking opportunities
- The platform rewards authentic storytelling, professional insights, controversial takes (when appropriate), and content that sparks meaningful discussions
- Posts with 1,300-1,600 characters tend to perform best for engagement
- Use power words that evoke emotion: breakthrough, revealed, mistake, secret, truth, behind-the-scenes, lesson, transformation
- Structure with hooks, story/insight, and clear call-to-action
- LinkedIn algorithm favors content that keeps users on the platform longer

WRITING STYLE REQUIREMENTS:
- Professional yet conversational tone
- Use short paragraphs (1-2 sentences max) for mobile readability
- Include personal anecdotes or universal experiences
- Ask thought-provoking questions to encourage comments
- Use strategic line breaks for visual appeal
- Be authentic and vulnerable when appropriate
- Include industry-specific terminology naturally

HASHTAG STRATEGY:
- Use 3-5 highly relevant hashtags maximum
- Mix trending industry hashtags with niche-specific ones
- Research shows posts with 3-5 hashtags get 17% more engagement than those with more
- Place hashtags strategically within the content, not just at the end
- Focus on hashtags with 10K-100K posts for optimal reach

ENGAGEMENT OPTIMIZATION:
- Start with a compelling hook that creates curiosity or controversy
- Include a clear call-to-action that encourages specific responses
- End with a question that invites professional opinions
- Use formatting that makes the post easy to scan and read
- Include insights that professionals can apply immediately

CONTENT STRUCTURE:
1. HOOK (First 2 lines): Create immediate curiosity or make a bold statement
2. CONTEXT/STORY: Provide background or tell a relatable story
3. INSIGHT/VALUE: Share the key takeaway, lesson, or professional insight
4. CALL-TO-ACTION: Encourage specific engagement (comment, share, connect)
5. HASHTAGS: 3-5 strategic hashtags integrated naturally

Now create the most engaging LinkedIn post possible from this transcript. Make it so compelling that other professionals cannot resist engaging with it. Focus on the core message, key insights, and professional value that can be extracted from this content.

The post should feel like it's written by a successful professional sharing genuine insights from their experience, not like promotional content. Make every word count for maximum impact and engagement.

Return only the final LinkedIn post content, formatted exactly as it should appear on LinkedIn.`;

    const result = await this.model.generateContent(prompt);
    return result.response.text().trim();
  }

  async generateTwitterContent(transcript) {
    const prompt = `
      You are an elite Twitter/X content creator and viral marketing strategist with over 10 years of experience making single tweets go viral.
      
      Your task is to turn the following video transcript into **ONE SINGLE TWEET ONLY** that:
      - Grabs attention immediately
      - Drives engagement (likes, comments, quote tweets)
      - Ranks on the algorithm in 2024–2025
      - Includes 1–3 highly relevant hashtags to increase reach
      
      VIDEO TRANSCRIPT:
      "${transcript}"
      
      SINGLE TWEET RULES:
      - Max: 280 characters
      - DO NOT create a thread
      - Use a powerful hook, punchy phrasing, and a relatable or insightful message
      - Include 1–3 **relevant** hashtags (not generic or spammy)
      - Use line breaks only if it improves readability
      - Optional: 1–2 emojis if they add emotion or emphasis
      
      TONE:
      - Relatable, real, and human
      - Not corporate or robotic
      - Slightly emotional or surprising if it fits
      - Avoid filler. Every word must earn its place.
      
      Your tweet must feel like it came from someone who’s been through it—and wants to help others win too.
      
      Now return exactly **one single tweet under 280 characters** with relevant hashtags included. Format exactly as it should appear on X.
      `;

    const result = await this.model.generateContent(prompt);
    return result.response.text().trim();
  }

  async generateInstagramContent(transcript) {
    const prompt = `
You are a master Instagram content creator and social media strategist with over 12 years of experience building viral Instagram accounts across multiple niches. You have an intimate understanding of Instagram's algorithm, user behavior, and what drives massive engagement in 2024-2025.

Your expertise spans:
- Creating scroll-stopping captions that drive saves and shares
- Mastering Instagram's complex algorithm and ranking factors
- Understanding the psychology of Instagram users across different demographics
- Crafting hashtag strategies that maximize reach without appearing spammy
- Creating authentic connections through storytelling and relatability
- Converting engagement into followers and business results

VIDEO TRANSCRIPT TO TRANSFORM:
"${transcript}"

INSTAGRAM ALGORITHM INSIGHTS (2024-2025):
- Instagram prioritizes content that keeps users on the platform longer
- Captions with 138-150 words get the highest engagement rates
- Posts with high saves and shares rank higher than those with just likes
- Instagram rewards authentic, personal storytelling over promotional content
- The first 3 lines of your caption are crucial - they determine if users will tap "more"
- Comments within the first hour significantly boost reach
- Instagram favors content that sparks meaningful conversations

INSTAGRAM USER PSYCHOLOGY:
- Users come to Instagram for inspiration, entertainment, and connection
- They engage with content that feels personal, relatable, or aspirational
- Visual storytelling is critical, but captions add depth and context
- Users respond to authenticity, vulnerability, and behind-the-scenes content
- They want content that feels like it's from a friend, not a brand

CAPTION STRATEGY:
- Ideal length: 138-150 words for maximum engagement
- Start with a hook that grabs attention in the first 10 words
- Use short paragraphs (1-2 sentences) for easy reading
- Include emojis to add personality and break up text
- Share personal stories or universal experiences
- Use power words: discover, secret, journey, transform, inspire
- End with a strong call-to-action to drive comments

HASHTAG STRATEGY:
- Use 5-9 hashtags for optimal reach and engagement
- Mix broad, trending hashtags (#Inspiration, #Motivation) with niche-specific ones
- Place hashtags at the end of the caption in a separate line
- Focus on hashtags with 50K-500K posts for discoverability
- Avoid overused hashtags (>1M posts) to prevent getting lost

ENGAGEMENT TRIGGERS:
- Ask open-ended questions that invite personal stories
- Share relatable struggles or triumphs
- Include actionable tips or insights users can apply
- Use conversational tone that feels like a friend talking
- Create content that users want to save for later
- Encourage tagging friends in the comments

CONTENT STRUCTURE:
1. HOOK (First 1-2 lines): Grab attention with a bold statement or question
2. STORY/INSIGHT: Share a relatable story or key takeaway
3. VALUE: Provide inspiration, education, or entertainment
4. CALL-TO-ACTION: Ask for comments, saves, or shares
5. HASHTAGS: 5-9 strategic hashtags at the end

Now transform this transcript into the most engaging Instagram caption possible. Make it impossible to scroll past and inspire users to save, share, or comment. Focus on the core message, emotional connection, or actionable insight that can be extracted from the transcript.

Create content that feels authentic, personal, and like it’s coming from someone who genuinely wants to connect with their audience, not just promote something.

Return only the final Instagram caption, formatted exactly as it should appear on Instagram.`;

    const result = await this.model.generateContent(prompt);
    return result.response.text().trim();
  }

  async generateTikTokContent(transcript) {
    const prompt = `
You are a TikTok content creation expert with over 8 years of experience building viral TikTok accounts across multiple niches. You understand TikTok's algorithm, user behavior, and what makes videos and captions go viral in 2024-2025.

Your expertise includes:
- Crafting captions that complement viral video content
- Understanding TikTok's For You Page (FYP) algorithm
- Creating content that resonates with TikTok's Gen Z and Millennial audiences
- Leveraging trends, sounds, and challenges for maximum reach
- Building authentic connections through humor, relatability, and storytelling
- Driving engagement through comments, likes, and shares

VIDEO TRANSCRIPT TO TRANSFORM:
"${transcript}"

TIKTOK ALGORITHM INSIGHTS (2024-2025):
- TikTok prioritizes content with high watch time and engagement
- Captions should be short (50-100 characters) to avoid overwhelming users
- Videos with high completion rates and rewatches rank higher
- TikTok rewards content that feels native to the platform
- The first 3 seconds are critical for grabbing attention
- Comments and shares within the first hour boost FYP visibility
- Trending sounds and hashtags can increase discoverability by 300%

TIKTOK USER PSYCHOLOGY:
- Users come for entertainment, humor, and quick inspiration
- They engage with authentic, raw, and relatable content
- Trends, challenges, and sounds drive massive engagement
- Users love content that feels unpolished but intentional
- They respond to humor, surprises, and emotional storytelling

CAPTION STRATEGY:
- Ideal length: 50-100 characters for quick readability
- Use emojis to add personality and convey tone
- Include a hook in the first 5-10 words
- Reference trends, sounds, or challenges when relevant
- Use conversational, playful, or bold tone
- Include a call-to-action to drive comments or shares

HASHTAG STRATEGY:
- Use 3-5 hashtags to leverage TikTok's discoverability
- Include 1-2 trending hashtags (#FYP, #ForYou, #Viral)
- Mix with niche-specific hashtags for targeted reach
- Avoid overused hashtags to stand out
- Place hashtags at the end of the caption

ENGAGEMENT TRIGGERS:
- Ask questions that spark quick, fun responses
- Include trending phrases or slang naturally
- Share relatable moments or hot takes
- Encourage duets, stitches, or challenge participation
- Create content that users want to rewatch or share
- Use humor, drama, or emotional hooks

CONTENT STRUCTURE:
1. HOOK (First 5-10 words): Grab attention with a bold or trendy statement
2. CORE MESSAGE: Share the key insight or story in a concise way
3. CALL-TO-ACTION: Encourage comments, likes, or challenge participation
4. HASHTAGS: 3-5 strategic hashtags at the end

Now transform this transcript into the most engaging TikTok caption possible. Make it short, punchy, and impossible to ignore. Focus on the core message, emotional hook, or trendy element that can be extracted from the transcript.

Create content that feels native to TikTok, like it’s from someone who lives and breathes the platform, not a brand trying to sell something.

Return only the final TikTok caption, formatted exactly as it should appear on TikTok.`;

    const result = await this.model.generateContent(prompt);
    return result.response.text().trim();
  }

  async generateFacebookContent(transcript) {
    const prompt = `
You are a Facebook content creation expert with over 10 years of experience building highly engaged Facebook communities across various niches. You have a deep understanding of Facebook's algorithm, user behavior, and what drives shares, comments, and likes in 2024-2025.

Your expertise includes:
- Crafting captions that spark conversations and community engagement
- Mastering Facebook's algorithm for maximum reach
- Understanding the psychology of diverse Facebook audiences
- Creating shareable content that resonates with families, professionals, and communities
- Building authentic connections through storytelling and relatability
- Driving engagement through emotional and inspirational content

VIDEO TRANSCRIPT TO TRANSFORM:
"${transcript}"

FACEBOOK ALGORITHM INSIGHTS (2024-2025):
- Facebook prioritizes content that sparks meaningful interactions
- Captions with 80-120 words perform best for engagement
- Posts with high comments and shares rank higher than likes alone
- Facebook rewards content that keeps users on the platform longer
- The first 2-3 lines determine if users will read more
- Content that encourages tagging friends or sharing boosts reach
- Groups and community-driven content get algorithmic priority

FACEBOOK USER PSYCHOLOGY:
- Users come for connection, inspiration, and community
- They engage with relatable stories, emotional content, and practical advice
- Content that feels personal or nostalgic performs well
- Users love shareable content they can send to friends or family
- They respond to positivity, humor, and actionable insights

CAPTION STRATEGY:
- Ideal length: 80-120 words for optimal engagement
- Start with a hook that evokes emotion or curiosity
- Use short paragraphs (1-2 sentences) for readability
- Include emojis to add warmth and approachability
- Share personal stories, lessons, or universal experiences
- Use power words: journey, discover, connect, inspire, transform
- End with a call-to-action to drive comments or shares

HASHTAG STRATEGY:
- Use 2-4 hashtags for discoverability
- Focus on community-driven or niche-specific hashtags
- Avoid overused hashtags to prevent blending into noise
- Place hashtags at the end of the caption
- Mix broad (#LifeLessons, #Inspiration) with niche hashtags

ENGAGEMENT TRIGGERS:
- Ask questions that invite personal stories or opinions
- Share relatable or emotional moments
- Include practical tips or life hacks users can apply
- Encourage tagging friends or sharing with family
- Use conversational tone that feels like a friend
- Create content that feels share-worthy

CONTENT STRUCTURE:
1. HOOK (First 1-2 lines): Grab attention with an emotional or curious statement
2. STORY/INSIGHT: Share a relatable story or key takeaway
3. VALUE: Provide inspiration, advice, or entertainment
4. CALL-TO-ACTION: Encourage comments, tags, or shares
5. HASHTAGS: 2-4 strategic hashtags at the end

Now transform this transcript into the most engaging Facebook caption possible. Make it emotional, shareable, and impossible to scroll past. Focus on the core message, emotional connection, or practical insight that can be extracted from the transcript.

Create content that feels like it’s from someone who wants to build a community, not just promote something.

Return only the final Facebook caption, formatted exactly as it should appear on Facebook.`;

    const result = await this.model.generateContent(prompt);
    return result.response.text().trim();
  }
}

module.exports = GeminiService;
